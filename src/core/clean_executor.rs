use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Result;

use crate::types::{CleanResult, PROJECT_OPERATION_STATE_DIR};
use crate::utils::logger::Logger;

use super::engine_resolver::EngineResolver;
use super::project_path_resolver::ProjectPathResolver;

pub struct CleanExecutor;

impl CleanExecutor {
    pub fn execute(
        project: Option<&str>,
        engine_path: Option<&str>,
        dry_run: bool,
        binaries_only: bool,
    ) -> Result<CleanResult> {
        let (project_path, _engine) =
            EngineResolver::resolve_project_and_engine(project, engine_path)?;

        let project_name = ProjectPathResolver::project_name(&project_path);
        let project_dir = ProjectPathResolver::project_dir(&project_path);
        let saved_dir = project_dir.join("Saved");

        Logger::info(&format!("Cleaning project: {project_name}"));
        Logger::info(&format!("Project directory: {}", project_dir.display()));
        Logger::info(&format!(
            "Mode: {}",
            if binaries_only {
                "Binaries and Intermediate only"
            } else {
                "Full clean"
            }
        ));
        if dry_run {
            Logger::info("Dry run mode - no files will be deleted");
        }
        Logger::divider();

        let mut paths_to_clean: Vec<PathBuf> = vec![
            project_dir.join("Binaries"),
            project_dir.join("Intermediate"),
        ];

        if !binaries_only {
            paths_to_clean.extend([
                saved_dir.clone(),
                project_dir.join("DerivedDataCache"),
                project_dir.join(format!("{project_name}.sln")),
                project_dir.join(".vs"),
                project_dir.join(".idea"),
            ]);
        }

        let mut result = CleanResult {
            deleted_paths: Vec::new(),
            failed_paths: Vec::new(),
        };

        for path in &paths_to_clean {
            if path == &saved_dir {
                Self::clean_saved(path, &project_dir, dry_run, &mut result);
            } else {
                Self::clean_path(path, &project_dir, dry_run, &mut result);
            }
        }

        // Clean plugin directories
        let plugins_dir = project_dir.join("Plugins");
        if plugins_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&plugins_dir) {
                for entry in entries.filter_map(Result::ok) {
                    let plugin_dir = entry.path();
                    if plugin_dir.is_dir() {
                        Self::clean_path(
                            &plugin_dir.join("Binaries"),
                            &project_dir,
                            dry_run,
                            &mut result,
                        );
                        Self::clean_path(
                            &plugin_dir.join("Intermediate"),
                            &project_dir,
                            dry_run,
                            &mut result,
                        );
                    }
                }
            }
        }

        Logger::divider();
        let count = result.deleted_paths.len();
        if count > 0 {
            Logger::success(&format!("Cleaned {count} item(s)"));
        } else {
            Logger::info("Nothing to clean");
        }

        Ok(result)
    }

    fn clean_saved(saved_dir: &Path, project_dir: &Path, dry_run: bool, result: &mut CleanResult) {
        let state_dir = saved_dir.join(PROJECT_OPERATION_STATE_DIR);
        if !state_dir.exists() {
            Self::clean_path(saved_dir, project_dir, dry_run, result);
            return;
        }

        let Ok(entries) = fs::read_dir(saved_dir) else {
            Self::clean_path(saved_dir, project_dir, dry_run, result);
            return;
        };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path == state_dir {
                continue;
            }
            Self::clean_path(&path, project_dir, dry_run, result);
        }
    }

    fn clean_path(path: &Path, project_dir: &Path, dry_run: bool, result: &mut CleanResult) {
        if !path.exists() {
            return;
        }

        let relative = path
            .strip_prefix(project_dir)
            .unwrap_or(path)
            .display()
            .to_string();

        if dry_run {
            Logger::success(&format!("Would remove: {relative}"));
            result.deleted_paths.push(path.to_path_buf());
            return;
        }

        let remove_result = if path.is_dir() {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        };

        match remove_result {
            Ok(()) => {
                Logger::success(&format!("Removed: {relative}"));
                result.deleted_paths.push(path.to_path_buf());
            }
            Err(e) => {
                Logger::error(&format!("Failed to remove {relative}: {e}"));
                result
                    .failed_paths
                    .push((path.to_path_buf(), e.to_string()));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use anyhow::Result;
    use tempfile::tempdir;

    use super::CleanExecutor;
    use crate::types::{CleanResult, PROJECT_OPERATION_STATE_DIR};

    #[test]
    fn full_clean_preserves_project_operation_state() -> Result<()> {
        let project = tempdir()?;
        let saved = project.path().join("Saved");
        let state = saved.join(PROJECT_OPERATION_STATE_DIR);
        let logs = saved.join("Logs");
        fs::create_dir_all(&state)?;
        fs::create_dir_all(&logs)?;
        fs::write(state.join("operation.lock"), "")?;
        fs::write(logs.join("editor.log"), "log")?;
        fs::write(saved.join("temporary.txt"), "temporary")?;
        let mut result = CleanResult {
            deleted_paths: Vec::new(),
            failed_paths: Vec::new(),
        };

        CleanExecutor::clean_saved(&saved, project.path(), false, &mut result);

        assert!(state.join("operation.lock").is_file());
        assert!(!logs.exists());
        assert!(!saved.join("temporary.txt").exists());
        assert!(result.failed_paths.is_empty());
        Ok(())
    }
}
