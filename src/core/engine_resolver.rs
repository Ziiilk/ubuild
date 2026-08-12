use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::error::UbuildError;
use crate::types::{
    EngineAssociation, EngineDetectionResult, EngineInstallation, EngineSource, EngineVersionInfo,
    LauncherManifest,
};
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
        let unresolved_association = result
            .uproject_engine
            .as_ref()
            .map(|association| association.id.as_str())
            .filter(|association| !association.is_empty());
        let engine = result.engine.ok_or_else(|| {
            unresolved_association.map_or(UbuildError::EngineUnresolvable, |association| {
                UbuildError::EngineAssociationUnresolvable {
                    association: association.to_string(),
                    details: result.warnings.join("; "),
                }
            })
        })?;

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
                Err(error) => {
                    warnings.push(format!("{error:#}"));
                    return EngineDetectionResult {
                        engine: None,
                        uproject_engine: None,
                        warnings,
                    };
                }
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

    /// Find all engine installations from registry and launcher.
    pub fn find_engine_installations() -> Vec<EngineInstallation> {
        let mut installations = Vec::new();

        // Windows registry
        #[cfg(target_os = "windows")]
        {
            installations.extend(Self::find_from_registry());
        }

        // Epic Launcher manifest
        installations.extend(Self::find_from_launcher());

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
        if let Some(association) = uproject_engine.filter(|association| !association.id.is_empty())
        {
            let exact_matches = installations
                .iter()
                .filter(|engine| engine.association_id == association.id)
                .collect::<Vec<_>>();
            if let Some(engine) = Self::unique_match(&association.id, &exact_matches, warnings) {
                return Some(engine);
            }
            if exact_matches.len() > 1 {
                return None;
            }

            if let Some(version) = Self::parse_major_minor(&association.id) {
                let launcher_matches = installations
                    .iter()
                    .filter(|engine| {
                        engine
                            .association_id
                            .strip_prefix("UE_")
                            .and_then(Self::parse_major_minor)
                            .is_some_and(|candidate| candidate == version)
                    })
                    .collect::<Vec<_>>();
                if let Some(engine) =
                    Self::unique_match(&association.id, &launcher_matches, warnings)
                {
                    return Some(engine);
                }
                if launcher_matches.len() > 1 {
                    return None;
                }

                let version_matches = installations
                    .iter()
                    .filter(|engine| {
                        engine
                            .version
                            .as_ref()
                            .is_some_and(|candidate| (candidate.major, candidate.minor) == version)
                    })
                    .collect::<Vec<_>>();
                if let Some(engine) =
                    Self::unique_match(&association.id, &version_matches, warnings)
                {
                    return Some(engine);
                }
                if version_matches.len() > 1 {
                    return None;
                }
            }

            warnings.push(format!(
                "Engine with association ID {} not found in installed engines",
                association.id
            ));
            return None;
        }

        if let Some(first) = installations.first() {
            warnings.push(format!(
                "Using engine {} (not associated with project)",
                first.display_name
            ));
            return Some(first.clone());
        }

        if installations.is_empty() {
            warnings.push(
                "No Unreal Engine installations found. Checked Windows Registry and Epic Launcher. Specify --engine-path manually.".to_string()
            );
        }

        None
    }

    fn unique_match(
        association: &str,
        matches: &[&EngineInstallation],
        warnings: &mut Vec<String>,
    ) -> Option<EngineInstallation> {
        match matches {
            [engine] => Some((*engine).clone()),
            [] => None,
            _ => {
                let paths = matches
                    .iter()
                    .map(|engine| engine.path.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", ");
                warnings.push(format!(
                    "Engine association {association} matches multiple installed engines: {paths}"
                ));
                None
            }
        }
    }

    fn parse_major_minor(version: &str) -> Option<(u32, u32)> {
        let normalized = version.replace('_', ".");
        let mut components = normalized.split('.');
        let major = components.next()?.parse().ok()?;
        let minor = components.next()?.parse().ok()?;
        components
            .all(|component| component.parse::<u32>().is_ok())
            .then_some((major, minor))
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

        let uproject = ProjectPathResolver::read_uproject(&uproject_path).with_context(|| {
            format!(
                "Failed to read project association from {}",
                uproject_path.display()
            )
        })?;

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
        let hives = [(HKEY_CURRENT_USER, "HKCU"), (HKEY_LOCAL_MACHINE, "HKLM")];

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
                    if let Some(installation) =
                        Self::registry_installation(name.clone(), engine_path)
                    {
                        results.push(installation);
                    }
                }
            }
        }

        results
    }

    fn registry_installation(
        association_id: String,
        engine_path: PathBuf,
    ) -> Option<EngineInstallation> {
        let version = Self::load_engine_version(&engine_path)?;
        Some(EngineInstallation {
            path: engine_path,
            display_name: format!("UE Engine {association_id}"),
            association_id,
            version: Some(version),
            installed_date: None,
            source: EngineSource::Registry,
        })
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

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::EngineResolver;
    use crate::types::{EngineAssociation, EngineInstallation, EngineSource, EngineVersionInfo};

    #[test]
    fn matches_version_association_using_loaded_engine_version() {
        let installations = vec![
            installation("5.8", "{ENGINE-58}"),
            installation("5.5", "{ENGINE-55}"),
        ];
        let association = EngineAssociation {
            id: "5.5".to_string(),
            name: None,
            path: None,
            version: None,
        };
        let mut warnings = Vec::new();

        let matched =
            EngineResolver::match_engine(Some(&association), &installations, &mut warnings);

        assert_eq!(
            matched.map(|engine| engine.path),
            Some(PathBuf::from("UE_5.5"))
        );
        assert!(warnings.is_empty());
    }

    #[test]
    fn does_not_fallback_when_project_association_is_unmatched() {
        let installations = vec![installation("5.8", "{ENGINE-58}")];
        let association = EngineAssociation {
            id: "5.5".to_string(),
            name: None,
            path: None,
            version: None,
        };
        let mut warnings = Vec::new();

        let matched =
            EngineResolver::match_engine(Some(&association), &installations, &mut warnings);

        assert!(matched.is_none());
        assert_eq!(
            warnings,
            ["Engine with association ID 5.5 not found in installed engines"]
        );
    }

    #[test]
    fn prefers_exact_association_id() {
        let installations = vec![
            installation("5.8", "custom-engine"),
            installation("5.5", "{ENGINE-55}"),
        ];
        let association = EngineAssociation {
            id: "custom-engine".to_string(),
            name: None,
            path: None,
            version: None,
        };
        let mut warnings = Vec::new();

        let matched =
            EngineResolver::match_engine(Some(&association), &installations, &mut warnings);

        assert_eq!(
            matched.map(|engine| engine.path),
            Some(PathBuf::from("UE_5.8"))
        );
        assert!(warnings.is_empty());
    }

    #[test]
    fn rejects_ambiguous_version_matches() {
        let installations = vec![
            installation_at("5.5", "{ENGINE-55-A}", "UE_5.5_A"),
            installation_at("5.5", "{ENGINE-55-B}", "UE_5.5_B"),
        ];
        let association = EngineAssociation {
            id: "5.5".to_string(),
            name: None,
            path: None,
            version: None,
        };
        let mut warnings = Vec::new();

        let matched =
            EngineResolver::match_engine(Some(&association), &installations, &mut warnings);

        assert!(matched.is_none());
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("matches multiple installed engines"));
        assert!(warnings[0].contains("UE_5.5_A"));
        assert!(warnings[0].contains("UE_5.5_B"));
    }

    #[test]
    fn does_not_fallback_when_uproject_cannot_be_parsed() -> anyhow::Result<()> {
        let directory = tempfile::tempdir()?;
        let project_path = directory.path().join("Invalid.uproject");
        std::fs::write(&project_path, "not json")?;

        let result = EngineResolver::resolve_engine(Some(&project_path));

        assert!(result.engine.is_none());
        assert!(result.uproject_engine.is_none());
        assert_eq!(result.warnings.len(), 1);
        assert!(result.warnings[0].contains("Invalid .uproject file"));
        Ok(())
    }

    #[test]
    fn rejects_registry_directory_without_engine_version() -> anyhow::Result<()> {
        let directory = tempfile::tempdir()?;

        let installation = EngineResolver::registry_installation(
            "INSTALLDIR".to_string(),
            directory.path().to_path_buf(),
        );

        assert!(installation.is_none());
        Ok(())
    }

    #[test]
    fn accepts_registry_directory_with_valid_engine_version() -> anyhow::Result<()> {
        let directory = tempfile::tempdir()?;
        let version_directory = directory.path().join("Engine").join("Build");
        std::fs::create_dir_all(&version_directory)?;
        std::fs::write(
            version_directory.join("Build.version"),
            r#"{
                "MajorVersion": 5,
                "MinorVersion": 5,
                "PatchVersion": 4
            }"#,
        )?;

        let installation = EngineResolver::registry_installation(
            "{ENGINE-55}".to_string(),
            directory.path().to_path_buf(),
        );

        let version = installation.and_then(|engine| engine.version);
        assert_eq!(
            version.map(|version| (version.major, version.minor)),
            Some((5, 5))
        );
        Ok(())
    }

    fn installation(version: &str, association_id: &str) -> EngineInstallation {
        installation_at(version, association_id, &format!("UE_{version}"))
    }

    fn installation_at(version: &str, association_id: &str, path: &str) -> EngineInstallation {
        let (major, minor) = version
            .split_once('.')
            .map(|(major, minor)| {
                (
                    major.parse::<u32>().unwrap_or_default(),
                    minor.parse::<u32>().unwrap_or_default(),
                )
            })
            .unwrap_or_default();

        EngineInstallation {
            path: PathBuf::from(path),
            association_id: association_id.to_string(),
            display_name: format!("UE {version}"),
            version: Some(EngineVersionInfo {
                major,
                minor,
                patch: 0,
                changelist: 0,
                compatible_changelist: 0,
                is_licensee_version: 0,
                is_promoted_build: 0,
                branch_name: String::new(),
                build_id: String::new(),
            }),
            installed_date: None,
            source: EngineSource::Registry,
        }
    }
}
