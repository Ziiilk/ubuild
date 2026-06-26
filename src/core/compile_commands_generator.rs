use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{Context, Result};

use crate::utils::logger::Logger;
use crate::utils::unreal_paths::resolve_ubt_path;

use super::engine_resolver::EngineResolver;
use super::project_path_resolver::ProjectPathResolver;
use super::target_resolver::TargetResolver;

pub struct CompileCommandsGenerator;

impl CompileCommandsGenerator {
    pub fn generate(
        target: &str,
        config: &str,
        platform: &str,
        project: Option<&str>,
        engine_path: Option<&str>,
        include_plugin_sources: bool,
        include_engine_sources: bool,
        use_engine_includes: bool,
    ) -> Result<PathBuf> {
        let (project_path, engine) =
            EngineResolver::resolve_project_and_engine(project, engine_path)?;

        let project_dir = ProjectPathResolver::project_dir(&project_path);

        // Resolve target name
        let available = TargetResolver::find_available_targets(&project_path);
        let resolved_target = TargetResolver::resolve_from_list(target, &available);

        let ubt_path = resolve_ubt_path(&engine)?;

        let mut args = vec![
            "-mode=GenerateClangDatabase".to_string(),
            format!("-Project={}", project_path.display()),
            format!("-Target={resolved_target} {platform} {config}"),
        ];

        if include_plugin_sources {
            args.push("-IncludePluginSources".to_string());
        }
        if include_engine_sources {
            args.push("-IncludeEngineSources".to_string());
        }
        if use_engine_includes {
            args.push("-UseEngineIncludes".to_string());
        }

        Logger::info(&format!(
            "Generating compile commands for {resolved_target} ({platform} {config})"
        ));

        let output = Command::new(&ubt_path)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .with_context(|| "Failed to run UnrealBuildTool")?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            Logger::debug(line);
        }

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!(
                "UBT exited with code {}:\n{}\n{stderr}",
                output.status.code().unwrap_or(-1),
                stdout.trim_end()
            );
        }

        // Relocate compile_commands.json
        let source_cc = engine.join("compile_commands.json");
        let dest_dir = project_dir.join(".vscode");
        let dest_cc = dest_dir.join("compile_commands.json");

        if source_cc.exists() {
            std::fs::create_dir_all(&dest_dir)?;
            std::fs::rename(&source_cc, &dest_cc)
                .or_else(|_| std::fs::copy(&source_cc, &dest_cc).map(|_| ()))?;

            // Update VSCode settings
            Self::update_vscode_settings(&dest_dir)?;
        } else if dest_cc.exists() {
            // Already in the right place
        } else {
            Logger::warning("compile_commands.json not found after generation");
        }

        Ok(dest_cc)
    }

    fn update_vscode_settings(vscode_dir: &Path) -> Result<()> {
        let settings_path = vscode_dir.join("settings.json");

        let mut settings: serde_json::Map<String, serde_json::Value> =
            if settings_path.exists() {
                let content = std::fs::read_to_string(&settings_path)?;
                serde_json::from_str(&content).unwrap_or_default()
            } else {
                serde_json::Map::new()
            };

        settings.insert(
            "C_Cpp.default.compileCommands".to_string(),
            serde_json::Value::String(
                "${workspaceFolder}/.vscode/compile_commands.json".to_string(),
            ),
        );
        settings.insert(
            "C_Cpp.intelliSenseEngine".to_string(),
            serde_json::Value::String("disabled".to_string()),
        );
        settings.insert(
            "clangd.arguments".to_string(),
            serde_json::Value::Array(vec![
                serde_json::Value::String(
                    "--compile-commands-dir=${workspaceFolder}/.vscode".to_string(),
                ),
                serde_json::Value::String("--background-index".to_string()),
                serde_json::Value::String("--j=8".to_string()),
                serde_json::Value::String("--index-store-path=.clangd/index".to_string()),
                serde_json::Value::String("--pch-storage=disk".to_string()),
                serde_json::Value::String("--limit-results=200".to_string()),
                serde_json::Value::String("--header-insertion=iwyu".to_string()),
            ]),
        );

        let json = serde_json::to_string_pretty(&settings)?;
        std::fs::write(&settings_path, json)?;

        Ok(())
    }
}
