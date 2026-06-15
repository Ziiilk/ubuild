use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::error::UbuildError;
use crate::types::{
    EngineAssociation, EngineDetectionResult, EngineInstallation, EngineSource, EngineVersionInfo,
    LauncherManifest,
};
use crate::utils::logger::Logger;
use crate::utils::unreal_paths::resolve_engine_version_path;
use crate::utils::version::compare_versions;

use super::project_path_resolver::ProjectPathResolver;

// ── Registry keys (Windows) ──

const REGISTRY_LOCATIONS: &[&str] = &[
    r"SOFTWARE\Epic Games\Unreal Engine\Builds",
    r"SOFTWARE\EpicGames\Unreal Engine",
    r"SOFTWARE\Epic Games\UE_5",
    r"SOFTWARE\Epic Games\UE_4",
];

// ── Environment variables for engine detection ──

const ENGINE_ENV_VARS: &[&str] = &["UE_ENGINE_PATH", "UE_ROOT", "UNREAL_ENGINE_PATH"];

pub struct EngineResolver;

impl EngineResolver {
    /// Resolve both project path and engine path in one call.
    pub fn resolve_project_and_engine(
        project_path: Option<&str>,
        engine_path: Option<&str>,
    ) -> Result<(PathBuf, PathBuf)> {
        let project = ProjectPathResolver::resolve_or_throw(project_path)?;
        let engine = Self::resolve_engine_path(Some(&project), engine_path)?;
        Ok((project, engine))
    }

    /// Resolve engine path from explicit path or auto-detection.
    pub fn resolve_engine_path(
        project_path: Option<&Path>,
        engine_path: Option<&str>,
    ) -> Result<PathBuf> {
        if let Some(ep) = engine_path {
            let p = PathBuf::from(ep);
            if !p.exists() {
                return Err(UbuildError::EngineNotFound(p).into());
            }
            return Ok(p);
        }

        let result = Self::resolve_engine(project_path);
        let engine = result
            .engine
            .ok_or(UbuildError::EngineUnresolvable)?;

        if !engine.path.exists() {
            return Err(UbuildError::EngineNotFound(engine.path).into());
        }
        Ok(engine.path)
    }

    /// Full engine detection: read .uproject association, find installations, match.
    pub fn resolve_engine(project_path: Option<&Path>) -> EngineDetectionResult {
        let mut warnings = Vec::new();

        let uproject_engine = if let Some(pp) = project_path {
            match Self::get_engine_association_from_project(pp) {
                Ok((assoc, w)) => {
                    warnings.extend(w);
                    Some(assoc)
                }
                Err(_) => None,
            }
        } else {
            None
        };

        let installations = Self::find_engine_installations();

        let matched = Self::match_engine(uproject_engine.as_ref(), &installations, &mut warnings);

        EngineDetectionResult {
            engine: matched,
            uproject_engine,
            warnings,
        }
    }

    /// Write engine status to stdout for dry-run output.
    pub fn write_engine_status(project_path: Option<&Path>) {
        let result = Self::resolve_engine(project_path);
        if let Some(engine) = &result.engine {
            Logger::info(&format!("Engine: {}", engine.display_name));
        } else {
            Logger::info("Engine: Not detected - specify with --engine-path");
        }
    }

    /// Find all engine installations from registry, launcher, and environment.
    pub fn find_engine_installations() -> Vec<EngineInstallation> {
        let mut installations = Vec::new();

        // Windows registry
        #[cfg(target_os = "windows")]
        {
            installations.extend(Self::find_from_registry());
        }

        // Epic Launcher manifest
        installations.extend(Self::find_from_launcher());

        // Environment variables
        installations.extend(Self::find_from_environment());

        // Deduplicate by path, preferring higher-priority sources
        Self::deduplicate(&mut installations);

        // Load version info
        for inst in &mut installations {
            if inst.version.is_none() {
                inst.version = Self::load_engine_version(&inst.path);
            }
        }

        // Sort by version descending
        installations.sort_by(|a, b| {
            let va = a
                .version
                .as_ref()
                .map_or(String::new(), std::string::ToString::to_string);
            let vb = b
                .version
                .as_ref()
                .map_or(String::new(), std::string::ToString::to_string);
            compare_versions(&vb, &va)
        });

        installations
    }

    fn match_engine(
        uproject_engine: Option<&EngineAssociation>,
        installations: &[EngineInstallation],
        warnings: &mut Vec<String>,
    ) -> Option<EngineInstallation> {
        if let Some(assoc) = uproject_engine {
            if !installations.is_empty() {
                let is_version = !assoc.id.starts_with('{');

                let matched = if is_version {
                    installations.iter().find(|e| {
                        if let Some(stripped) = e.association_id.strip_prefix("UE_") {
                            let v = stripped.replace('_', ".");
                            compare_versions(&v, &assoc.id) == std::cmp::Ordering::Equal
                        } else {
                            false
                        }
                    })
                } else {
                    installations
                        .iter()
                        .find(|e| e.association_id == assoc.id)
                };

                if let Some(m) = matched {
                    return Some(m.clone());
                }

                warnings.push(format!(
                    "Engine with association ID {} not found in installed engines",
                    assoc.id
                ));
            }
        }

        // Fallback: use newest installed engine
        if let Some(first) = installations.first() {
            warnings.push(format!(
                "Using engine {} (not associated with project)",
                first.display_name
            ));
            return Some(first.clone());
        }

        if installations.is_empty() {
            warnings.push(
                "No Unreal Engine installations found. Checked Windows Registry, Epic Launcher, and environment variables. Specify --engine-path manually.".to_string()
            );
        }

        None
    }

    fn get_engine_association_from_project(
        project_path: &Path,
    ) -> Result<(EngineAssociation, Vec<String>)> {
        let uproject_path = if project_path.extension().is_some_and(|e| e == "uproject") {
            project_path.to_path_buf()
        } else {
            // Find .uproject in directory
            let pattern = format!("{}/*.uproject", project_path.display());
            let entries: Vec<_> = glob::glob(&pattern)
                .into_iter()
                .flatten()
                .filter_map(Result::ok)
                .collect();
            entries
                .into_iter()
                .next()
                .ok_or_else(|| UbuildError::NoUprojectFound(project_path.to_path_buf()))?
        };

        let content = fs::read_to_string(&uproject_path)
            .with_context(|| format!("Failed to read {}", uproject_path.display()))?;
        let uproject: crate::types::UProject = serde_json::from_str(&content)
            .with_context(|| format!("Failed to parse {}", uproject_path.display()))?;

        let mut warnings = Vec::new();
        if uproject.engine_association.is_empty() {
            warnings.push("No EngineAssociation found in .uproject".to_string());
        }

        Ok((
            EngineAssociation {
                id: uproject.engine_association,
                name: None,
                path: None,
                version: None,
            },
            warnings,
        ))
    }

    // ── Registry (Windows only) ──

    #[cfg(target_os = "windows")]
    fn find_from_registry() -> Vec<EngineInstallation> {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        use winreg::RegKey;

        let mut results = Vec::new();
        let hives = [
            (HKEY_CURRENT_USER, "HKCU"),
            (HKEY_LOCAL_MACHINE, "HKLM"),
        ];

        for (hive, _label) in &hives {
            for location in REGISTRY_LOCATIONS {
                let Ok(key) = RegKey::predef(*hive).open_subkey(location) else {
                    continue;
                };
                for (name, value) in key.enum_values().filter_map(Result::ok) {
                    let winreg::RegValue { ref bytes, vtype } = value;
                    if vtype != winreg::enums::RegType::REG_SZ {
                        continue;
                    }
                    let path_str = String::from_utf16_lossy(
                        &bytes
                            .chunks_exact(2)
                            .map(|c| u16::from_le_bytes([c[0], c[1]]))
                            .collect::<Vec<_>>(),
                    )
                    .trim_end_matches('\0')
                    .to_string();

                    if path_str.is_empty() {
                        continue;
                    }

                    let engine_path = PathBuf::from(&path_str);
                    if engine_path.exists() {
                        results.push(EngineInstallation {
                            path: engine_path,
                            association_id: name.clone(),
                            display_name: format!("UE Engine {name}"),
                            version: None,
                            installed_date: None,
                            source: EngineSource::Registry,
                        });
                    }
                }
            }
        }

        results
    }

    fn find_from_launcher() -> Vec<EngineInstallation> {
        let manifest_paths = Self::launcher_manifest_paths();

        for manifest_path in manifest_paths {
            let Ok(content) = fs::read_to_string(&manifest_path) else {
                continue;
            };
            let Ok(manifest) = serde_json::from_str::<LauncherManifest>(&content) else {
                continue;
            };

            let mut results = Vec::new();
            for entry in &manifest.installation_list {
                if !entry.app_name.starts_with("UE_") && !entry.app_name.contains("UnrealEngine") {
                    continue;
                }
                let engine_path = PathBuf::from(&entry.install_location);
                if !engine_path.exists() {
                    continue;
                }
                results.push(EngineInstallation {
                    path: engine_path,
                    association_id: entry.app_name.clone(),
                    display_name: if entry.display_name.is_empty() {
                        entry.app_name.clone()
                    } else {
                        entry.display_name.clone()
                    },
                    version: None,
                    installed_date: if entry.install_date.is_empty() {
                        None
                    } else {
                        Some(entry.install_date.clone())
                    },
                    source: EngineSource::Launcher,
                });
            }

            if !results.is_empty() {
                return results;
            }
        }

        Vec::new()
    }

    fn find_from_environment() -> Vec<EngineInstallation> {
        let mut results = Vec::new();

        for var_name in ENGINE_ENV_VARS {
            if let Ok(value) = env::var(var_name) {
                let engine_path = PathBuf::from(&value);
                if engine_path.exists() {
                    results.push(EngineInstallation {
                        path: engine_path,
                        association_id: format!("env:{var_name}"),
                        display_name: format!("UE Engine (${var_name})"),
                        version: None,
                        installed_date: None,
                        source: EngineSource::Environment,
                    });
                }
            }
        }

        results
    }

    fn launcher_manifest_paths() -> Vec<PathBuf> {
        let mut paths = Vec::new();
        let local = env::var("LOCALAPPDATA").unwrap_or_default();
        let programdata = env::var("PROGRAMDATA").unwrap_or_default();
        let appdata = env::var("APPDATA").unwrap_or_default();

        let candidates = [
            format!("{local}/UnrealEngine/Common/LauncherInstalled.dat"),
            format!("{programdata}/Epic/UnrealEngineLauncher/LauncherInstalled.dat"),
            format!("{programdata}/Epic/EpicGamesLauncher/Data/LauncherInstalled.dat"),
            format!("{appdata}/Epic/UnrealEngineLauncher/LauncherInstalled.dat"),
            format!("{appdata}/Epic/EpicGamesLauncher/Data/LauncherInstalled.dat"),
            format!("{local}/EpicGamesLauncher/Data/LauncherInstalled.dat"),
            format!("{appdata}/Epic Games/Launcher/Data/LauncherInstalled.dat"),
        ];

        for c in candidates {
            paths.push(PathBuf::from(c));
        }
        paths
    }

    fn load_engine_version(engine_path: &Path) -> Option<EngineVersionInfo> {
        let version_file = resolve_engine_version_path(engine_path)?;
        let content = fs::read_to_string(version_file).ok()?;
        serde_json::from_str(&content).ok()
    }

    fn deduplicate(installations: &mut Vec<EngineInstallation>) {
        installations.sort_by(|a, b| {
            a.path
                .cmp(&b.path)
                .then(a.source.priority().cmp(&b.source.priority()))
        });
        installations.dedup_by(|a, b| {
            if a.path == b.path {
                // Keep the one with higher priority (lower number)
                if a.source.priority() > b.source.priority() {
                    std::mem::swap(a, b);
                }
                true
            } else {
                false
            }
        });
    }
}
