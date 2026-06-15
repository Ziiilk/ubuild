use std::path::{Path, PathBuf};

use anyhow::Result;

use crate::types::{ModuleInfo, ProjectDetectionResult, ProjectInfo, ResolvedTarget};
use crate::utils::version::infer_target_type;

use super::project_path_resolver::ProjectPathResolver;

pub struct ProjectDetector;

impl ProjectDetector {
    pub fn detect(cwd: Option<&str>, recursive: bool) -> Result<ProjectDetectionResult> {
        let dir = cwd.map_or_else(
            || std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            PathBuf::from,
        );

        let mut warnings = Vec::new();

        let pattern = if recursive {
            format!("{}/**/*.uproject", dir.display())
        } else {
            format!("{}/*.uproject", dir.display())
        };

        let uproject_files: Vec<PathBuf> = glob::glob(&pattern)
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .collect();

        let uproject_path = match uproject_files.first() {
            Some(p) => p.clone(),
            None => {
                return Ok(ProjectDetectionResult {
                    project: None,
                    warnings: vec!["No .uproject file found".to_string()],
                });
            }
        };

        let uproject = ProjectPathResolver::read_uproject(&uproject_path)?;

        if uproject.file_version != Some(3) {
            warnings.push(format!(
                "Unexpected FileVersion: {:?} (expected 3)",
                uproject.file_version
            ));
        }
        if uproject.engine_association.is_empty() {
            warnings.push("No EngineAssociation set in .uproject".to_string());
        }

        let project_name = ProjectPathResolver::project_name(&uproject_path);
        let project_dir = ProjectPathResolver::project_dir(&uproject_path);
        let source_dir = project_dir.join("Source");
        let has_source = source_dir.is_dir();

        let targets = if has_source {
            Self::find_targets(&source_dir)
        } else {
            Vec::new()
        };

        let modules = if has_source {
            Self::find_modules(&source_dir)
        } else {
            Vec::new()
        };

        Ok(ProjectDetectionResult {
            project: Some(ProjectInfo {
                name: project_name,
                path: uproject_path,
                uproject,
                source_dir: has_source.then_some(source_dir),
                targets,
                modules,
            }),
            warnings,
        })
    }

    fn find_targets(source_dir: &Path) -> Vec<ResolvedTarget> {
        let pattern = format!("{}/*.Target.cs", source_dir.display());
        glob::glob(&pattern)
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .filter_map(|p| {
                let stem = p.file_stem()?.to_string_lossy().to_string();
                let name = stem.strip_suffix(".Target")?;
                Some(ResolvedTarget {
                    name: name.to_string(),
                    target_type: infer_target_type(name).to_string(),
                })
            })
            .collect()
    }

    fn find_modules(source_dir: &Path) -> Vec<ModuleInfo> {
        let pattern = format!("{}/**/*.Build.cs", source_dir.display());
        glob::glob(&pattern)
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .filter_map(|p| {
                let stem = p.file_stem()?.to_string_lossy().to_string();
                let name = stem.strip_suffix(".Build")?;
                Some(ModuleInfo {
                    name: name.to_string(),
                    path: p,
                })
            })
            .collect()
    }
}
