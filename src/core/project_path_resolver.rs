use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Result;

use crate::error::UbuildError;

pub struct ProjectPathResolver;

impl ProjectPathResolver {
    /// Resolve input to exactly one .uproject file path.
    pub fn resolve_strict(project_path: Option<&str>) -> Result<PathBuf> {
        Self::resolve(project_path, true)
    }

    /// Resolve input to a .uproject file path, or throw.
    pub fn resolve_or_throw(project_path: Option<&str>) -> Result<PathBuf> {
        Self::resolve(project_path, false)
    }

    fn resolve(project_path: Option<&str>, strict: bool) -> Result<PathBuf> {
        let input = project_path.map_or_else(
            || std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            PathBuf::from,
        );

        if input.is_dir() {
            return Self::find_uproject_in_dir(&input, strict);
        }

        if input
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("uproject"))
        {
            if !input.exists() {
                return Err(UbuildError::ProjectFileNotFound(input).into());
            }
            return Ok(input);
        }

        // Not a directory and not a .uproject file
        Err(UbuildError::NoUprojectFound(input).into())
    }

    fn find_uproject_in_dir(dir: &Path, strict: bool) -> Result<PathBuf> {
        let pattern = format!("{}/*.uproject", dir.display());
        let entries: Vec<PathBuf> = glob::glob(&pattern)
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .collect();

        match entries.len() {
            0 => Err(UbuildError::NoUprojectFound(dir.to_path_buf()).into()),
            1 => {
                // SAFETY: len == 1 guaranteed by match
                let entry = entries
                    .into_iter()
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("unexpected empty iterator"))?;
                Ok(entry)
            }
            _ => {
                if strict {
                    anyhow::bail!(
                        "Multiple .uproject files found in {}: {}",
                        dir.display(),
                        entries
                            .iter()
                            .map(|path| path.display().to_string())
                            .collect::<Vec<_>>()
                            .join(", ")
                    );
                }
                // Multiple .uproject files; use first, warn via logger
                crate::utils::logger::Logger::warning(&format!(
                    "Multiple .uproject files found in {}, using {}",
                    dir.display(),
                    entries[0].display()
                ));
                let entry = entries
                    .into_iter()
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("unexpected empty iterator"))?;
                Ok(entry)
            }
        }
    }

    /// Extract the project name from a .uproject path.
    pub fn project_name(uproject_path: &Path) -> String {
        uproject_path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default()
    }

    /// Get the project directory from a .uproject path.
    pub fn project_dir(uproject_path: &Path) -> PathBuf {
        uproject_path
            .parent()
            .map_or_else(|| PathBuf::from("."), Path::to_path_buf)
    }

    /// Read and parse a .uproject file.
    pub fn read_uproject(uproject_path: &Path) -> Result<crate::types::UProject> {
        let content = fs::read_to_string(uproject_path)
            .map_err(|_| UbuildError::ProjectFileNotFound(uproject_path.to_path_buf()))?;
        let content = content.strip_prefix('\u{feff}').unwrap_or(&content);
        let uproject: crate::types::UProject = serde_json::from_str(content).map_err(|e| {
            UbuildError::InvalidUproject(format!("{}: {e}", uproject_path.display()))
        })?;
        Ok(uproject)
    }
}

#[cfg(test)]
mod tests {
    use super::ProjectPathResolver;

    #[test]
    fn reads_uproject_with_utf8_bom() -> anyhow::Result<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("BomProject.uproject");
        std::fs::write(
            &path,
            "\u{feff}{\"FileVersion\":3,\"EngineAssociation\":\"5.5\"}",
        )?;

        let project = ProjectPathResolver::read_uproject(&path)?;

        assert_eq!(project.file_version, Some(3));
        assert_eq!(project.engine_association, "5.5");
        Ok(())
    }
}
