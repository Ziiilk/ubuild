use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Result;

use crate::types::CleanResult;
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
                project_dir.join("Saved"),
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
            Self::clean_path(path, &project_dir, dry_run, &mut result);
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

    fn clean_path(
        path: &Path,
        project_dir: &Path,
        dry_run: bool,
        result: &mut CleanResult,
    ) {
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
