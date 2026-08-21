use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result};
#[cfg(not(windows))]
use std::fs::File as NonWindowsFile;
#[cfg(not(windows))]
use std::io;
#[cfg(not(windows))]
use tempfile::tempdir;
#[cfg(not(windows))]
use zip::ZipArchive;

use crate::platform;
use crate::types::EngineVersionInfo;
use crate::utils::logger::Logger;
use crate::utils::unreal_paths::resolve_engine_version_path;

const LLVM_CACHE_DIR: &str = "ubuild/llvm";

pub struct LlvmInstallation {
    pub clangd_path: PathBuf,
}

pub struct LlvmManager;

impl LlvmManager {
    pub fn ensure_for_engine(engine_path: &Path) -> Result<LlvmInstallation> {
        let engine_version = Self::read_engine_version(engine_path)?;
        let version = Self::required_version(&engine_version).ok_or_else(|| {
            anyhow::anyhow!(
                "Automatic LLVM installation is not configured for Unreal Engine {engine_version}"
            )
        })?;
        if !cfg!(any(windows, target_os = "linux", target_os = "macos")) {
            anyhow::bail!("Automatic LLVM installation is unsupported on this platform");
        }

        if let Some(clangd_path) = Self::find_system_clangd(version) {
            Logger::info(&format!("Using LLVM {version}: {}", clangd_path.display()));
            return Ok(LlvmInstallation { clangd_path });
        }

        let install_root = Self::installation_root(version)?;
        let clangd_path = Self::clangd_path(&install_root);
        let installed = Self::is_matching_clangd(&clangd_path, version);
        if installed {
            Logger::info(&format!("Using LLVM {version}: {}", clangd_path.display()));
            return Ok(LlvmInstallation { clangd_path });
        }
        Self::install(version, &install_root)?;
        if !Self::is_matching_clangd(&clangd_path, version) {
            anyhow::bail!(
                "Installed LLVM at {} does not provide clangd {version}",
                install_root.display()
            );
        }

        Ok(LlvmInstallation { clangd_path })
    }

    fn read_engine_version(engine_path: &Path) -> Result<EngineVersionInfo> {
        let version_path = resolve_engine_version_path(engine_path).ok_or_else(|| {
            anyhow::anyhow!(
                "Unable to determine Unreal Engine version from {}",
                engine_path.display()
            )
        })?;
        let content = fs::read_to_string(&version_path)
            .with_context(|| format!("Failed to read {}", version_path.display()))?;
        serde_json::from_str(&content)
            .with_context(|| format!("Failed to parse {}", version_path.display()))
    }

    fn required_version(version: &EngineVersionInfo) -> Option<&'static str> {
        match (version.major, version.minor) {
            (5, 0) if version.patch >= 2 => Some("13.0.1"),
            (5, 0) => Some("11.0.1"),
            (5, 1) => Some("13.0.1"),
            (5, 2) => Some("15.0.1"),
            (5, 3 | 4) => Some("16.0.6"),
            (5, 5) => Some("18.1.3"),
            (5, 6) => Some("18.1.8"),
            (5, 7 | 8) => Some("20.1.8"),
            _ => None,
        }
    }

    fn find_system_clangd(required_version: &str) -> Option<PathBuf> {
        let locator = if cfg!(windows) { "where" } else { "which" };
        let mut command = Command::new(locator);
        command.arg("clangd");
        let output = super::process_runner::ProcessRunner::capture(&mut command).ok()?;
        if output.exit_code != 0 {
            return None;
        }

        output
            .stdout
            .lines()
            .map(PathBuf::from)
            .find(|path| Self::is_matching_clangd(path, required_version))
    }

    fn is_matching_clangd(path: &Path, required_version: &str) -> bool {
        let mut command = Command::new(path);
        command.arg("--version");
        let Ok(output) = super::process_runner::ProcessRunner::capture(&mut command) else {
            return false;
        };
        output.exit_code == 0 && output.stdout.contains(required_version)
    }

    #[cfg(not(windows))]
    fn cache_root() -> Result<PathBuf> {
        #[cfg(target_os = "macos")]
        {
            if let Some(home) = env::var_os("HOME") {
                return Ok(PathBuf::from(home).join("Library/Caches"));
            }
        }

        #[cfg(target_os = "linux")]
        {
            if let Some(cache_home) = env::var_os("XDG_CACHE_HOME") {
                return Ok(PathBuf::from(cache_home));
            }
            if let Some(home) = env::var_os("HOME") {
                return Ok(PathBuf::from(home).join(".cache"));
            }
        }

        anyhow::bail!("Unable to determine a user-local cache directory")
    }

    fn installation_root(version: &str) -> Result<PathBuf> {
        #[cfg(windows)]
        {
            let program_files = env::var_os("ProgramFiles")
                .ok_or_else(|| anyhow::anyhow!("ProgramFiles environment variable is missing"))?;
            let _ = version;
            Ok(PathBuf::from(program_files).join("LLVM"))
        }

        #[cfg(not(windows))]
        {
            Ok(Self::cache_root()?.join(LLVM_CACHE_DIR).join(version))
        }
    }

    #[cfg(windows)]
    fn install(version: &str, install_root: &Path) -> Result<()> {
        let url = format!(
            "https://github.com/llvm/llvm-project/releases/download/llvmorg-{version}/LLVM-{version}-win64.exe"
        );
        Logger::info(&format!("LLVM {version} not found; downloading from {url}"));

        let client = reqwest::blocking::Client::builder()
            .user_agent("ubuild")
            .build()
            .context("Failed to create LLVM download client")?;
        let response = client
            .get(&url)
            .send()
            .with_context(|| format!("Failed to download LLVM {version}"))?
            .error_for_status()
            .with_context(|| format!("LLVM download failed: {url}"))?;
        let staging = tempfile::tempdir()?;
        let installer_path = staging.path().join(format!("LLVM-{version}-win64.exe"));
        let mut installer_file = fs::File::create(&installer_path)
            .context("Failed to create temporary LLVM installer")?;
        let mut response = response;
        std::io::copy(&mut response, &mut installer_file)
            .context("Failed to save downloaded LLVM installer")?;
        let destination = format!("/D={}", install_root.display());
        let status = Command::new(&installer_path)
            .args(["/S", &destination])
            .status()
            .context("Failed to launch the LLVM installer")?;
        if !status.success() {
            anyhow::bail!(
                "LLVM installer exited with status {}; installing to {} may require administrator privileges",
                status,
                install_root.display()
            );
        }
        Logger::success(&format!(
            "LLVM {version} installed: {}",
            install_root.display()
        ));
        Ok(())
    }

    #[cfg(not(windows))]
    fn install(version: &str, install_root: &Path) -> Result<()> {
        let asset = Self::asset_name().ok_or_else(|| {
            anyhow::anyhow!("Automatic LLVM installation is unsupported on this platform")
        })?;
        let url = format!(
            "https://github.com/clangd/clangd/releases/download/{version}/clangd-{asset}-{version}.zip"
        );
        Logger::info(&format!("LLVM {version} not found; downloading from {url}"));

        let client = reqwest::blocking::Client::builder()
            .user_agent("ubuild")
            .build()
            .context("Failed to create LLVM download client")?;
        let response = client
            .get(&url)
            .send()
            .with_context(|| format!("Failed to download LLVM {version}"))?
            .error_for_status()
            .with_context(|| format!("LLVM download failed: {url}"))?;
        let staging = tempdir()?;
        let archive_path = staging.path().join(format!("clangd-{version}.zip"));
        let mut archive_file =
            fs::File::create(&archive_path).context("Failed to create temporary LLVM archive")?;
        let mut response = response;
        std::io::copy(&mut response, &mut archive_file)
            .context("Failed to save downloaded LLVM archive")?;
        drop(archive_file);

        let mut archive = ZipArchive::new(fs::File::open(&archive_path)?)?;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index)?;
            let Some(entry_path) = entry.enclosed_name() else {
                anyhow::bail!("LLVM archive contains an unsafe path");
            };
            let output_path = staging.path().join(entry_path);
            if entry.is_dir() {
                fs::create_dir_all(&output_path)?;
                continue;
            }
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = NonWindowsFile::create(&output_path)?;
            io::copy(&mut entry, &mut output)?;
        }

        let extracted_root = staging.path().join(format!("clangd_{version}"));
        if !Self::clangd_path(&extracted_root).exists() {
            anyhow::bail!("LLVM archive did not contain clangd {version}");
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            let clangd_path = Self::clangd_path(&extracted_root);
            let mut permissions = fs::metadata(&clangd_path)?.permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(clangd_path, permissions)?;
        }
        if let Some(parent) = install_root.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&extracted_root, install_root).with_context(|| {
            format!(
                "Failed to install LLVM {version} into {}",
                install_root.display()
            )
        })?;
        Logger::success(&format!(
            "LLVM {version} installed: {}",
            install_root.display()
        ));
        Ok(())
    }

    #[cfg(target_os = "linux")]
    fn asset_name() -> Option<&'static str> {
        Some("linux")
    }

    #[cfg(target_os = "macos")]
    fn asset_name() -> Option<&'static str> {
        Some("mac")
    }

    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    fn asset_name() -> Option<&'static str> {
        None
    }

    fn clangd_path(install_root: &Path) -> PathBuf {
        install_root
            .join("bin")
            .join(format!("clangd{}", platform::exe_extension()))
    }
}

#[cfg(test)]
mod tests {
    use crate::types::EngineVersionInfo;

    use super::LlvmManager;

    fn version(major: u32, minor: u32) -> EngineVersionInfo {
        EngineVersionInfo {
            major,
            minor,
            patch: 0,
            changelist: 0,
            compatible_changelist: 0,
            is_licensee_version: 0,
            is_promoted_build: 0,
            branch_name: String::new(),
            build_id: String::new(),
        }
    }

    #[test]
    fn maps_unreal_5_5_to_llvm_18_1_3() {
        assert_eq!(
            LlvmManager::required_version(&version(5, 5)),
            Some("18.1.3")
        );
    }

    #[test]
    fn does_not_guess_unknown_engine_versions() {
        assert_eq!(LlvmManager::required_version(&version(4, 27)), None);
    }
}
