use std::fs;
use std::path::Path;

use anyhow::Result;

use crate::types::SwitchResult;
use crate::utils::logger::Logger;

use super::engine_resolver::EngineResolver;
use super::project_path_resolver::ProjectPathResolver;

pub struct SwitchExecutor;

impl SwitchExecutor {
    pub fn execute(
        project: Option<&str>,
        engine_path: Option<&str>,
    ) -> Result<SwitchResult> {
        let project_path = ProjectPathResolver::resolve_or_throw(project)?;
        let mut uproject = ProjectPathResolver::read_uproject(&project_path)?;

        let previous = uproject.engine_association.clone();
        Logger::info(&format!("Current engine association: {previous}"));

        let target_engine = if let Some(ep) = engine_path {
            let p = std::path::PathBuf::from(ep);
            if !p.exists() {
                anyhow::bail!("Engine path does not exist: {ep}");
            }
            p
        } else {
            let installations = EngineResolver::find_engine_installations();
            if installations.is_empty() {
                anyhow::bail!("No Unreal Engine installations found");
            }

            Logger::info("Available Unreal Engine installations:");
            let items: Vec<String> = installations
                .iter()
                .map(|inst| {
                    let marker = if inst.association_id == previous {
                        " [current]"
                    } else {
                        ""
                    };
                    format!(
                        "{} ({}){marker}",
                        inst.display_name,
                        inst.path.display()
                    )
                })
                .collect();

            let selection = dialoguer::Select::new()
                .with_prompt("Select engine")
                .items(&items)
                .default(0)
                .interact()?;

            installations[selection].path.clone()
        };

        let new_association = Self::get_association_id(&target_engine);

        if new_association == previous {
            Logger::info("Engine already set to selected engine");
            return Ok(SwitchResult {
                previous_association: previous,
                new_association,
                uproject_path: project_path,
            });
        }

        uproject.engine_association.clone_from(&new_association);
        let json = serde_json::to_string_pretty(&uproject)?;
        fs::write(&project_path, json)?;

        Logger::success(&format!(
            "Switched engine association: {previous} → {new_association}"
        ));

        Ok(SwitchResult {
            previous_association: previous,
            new_association,
            uproject_path: project_path,
        })
    }

    fn get_association_id(engine_path: &Path) -> String {
        // Try to read version info
        if let Some(version_path) =
            crate::utils::unreal_paths::resolve_engine_version_path(engine_path)
        {
            if let Ok(content) = fs::read_to_string(version_path) {
                if let Ok(info) = serde_json::from_str::<crate::types::EngineVersionInfo>(&content)
                {
                    return format!("{}.{}", info.major, info.minor);
                }
            }
        }
        String::new()
    }
}
