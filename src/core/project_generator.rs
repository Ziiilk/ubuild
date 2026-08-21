use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result};

use crate::types::defaults::{BUILD_CONFIG, BUILD_PLATFORM};
use crate::types::GenerateResult;
use crate::utils::file::atomic_write;
use crate::utils::logger::Logger;
use crate::utils::unreal_paths::resolve_ubt_path;

use super::compile_commands_generator::CompileCommandsGenerator;
use super::engine_resolver::EngineResolver;
use super::llvm_manager::LlvmManager;
use super::process_runner::ProcessRunner;
use super::project_path_resolver::ProjectPathResolver;

pub struct ProjectGenerator;

impl ProjectGenerator {
    pub fn generate(
        ide: &str,
        project: Option<&str>,
        engine_path: Option<&str>,
        force: bool,
    ) -> Result<GenerateResult> {
        let (project_path, engine) =
            EngineResolver::resolve_project_and_engine(project, engine_path)?;

        let project_dir = ProjectPathResolver::project_dir(&project_path);
        let ubt_path = resolve_ubt_path(&engine)?;

        let mut args = vec![
            "-projectfiles".to_string(),
            format!("-project={}", project_path.display()),
            "-game".to_string(),
            "-engine".to_string(),
        ];

        match ide {
            "vscode" => args.push("-VSCode".to_string()),
            "clion" => args.push("-CLion".to_string()),
            "xcode" => args.push("-XCodeProjectFiles".to_string()),
            _ => {} // sln / vs2022 are default
        }

        if force {
            args.push("-force".to_string());
        }

        Logger::info(&format!("Generating {ide} project files..."));

        let mut command = Command::new(&ubt_path);
        command.args(&args);
        let output = ProcessRunner::stream(&mut command)?;
        if output.exit_code != 0 {
            anyhow::bail!(
                "Project file generation failed with exit code {}",
                output.exit_code
            );
        }

        // VSCode needs a compile database and a workspace containing its editor
        // settings and tasks. Keep the compile database in the project root so
        // clangd can discover it from project source files by default.
        if ide == "vscode" {
            let llvm = LlvmManager::ensure_for_engine(&engine)?;
            CompileCommandsGenerator::generate_with_paths(
                BUILD_CONFIG,
                BUILD_PLATFORM,
                &project_path,
                &engine,
                &ubt_path,
                true,
                true,
                true,
                &[],
            )?;
            Self::generate_vscode_workspace(&project_dir, &project_path, &llvm.clangd_path)?;
        }

        let generated = Self::find_generated_files(&project_dir, ide);

        Ok(GenerateResult {
            generated_files: generated,
        })
    }

    pub fn list_ides() {
        Logger::subtitle("Available IDE types:");
        let descriptions = [
            ("sln", "Visual Studio Solution (.sln)"),
            ("vs2022", "Visual Studio 2022 project files"),
            ("vscode", "Visual Studio Code with .code-workspace config"),
            ("clion", "CLion with CMakeLists.txt"),
            ("xcode", "Xcode project files (macOS)"),
        ];
        for (name, desc) in &descriptions {
            Logger::writeln(&format!("  {name:10} {desc}"));
        }
    }

    fn find_generated_files(project_dir: &Path, ide: &str) -> Vec<PathBuf> {
        let patterns: Vec<String> = match ide {
            "sln" | "vs2022" => vec![
                format!("{}/*.sln", project_dir.display()),
                format!("{}/**/*.vcxproj", project_dir.display()),
            ],
            "clion" => vec![format!("{}/**/CMakeLists.txt", project_dir.display())],
            "xcode" => vec![format!("{}/**/*.xcodeproj", project_dir.display())],
            "vscode" => vec![
                format!("{}/*.code-workspace", project_dir.display()),
                format!("{}/compile_commands.json", project_dir.display()),
                format!("{}/.vscode/**", project_dir.display()),
            ],
            _ => Vec::new(),
        };

        let mut files = Vec::new();
        for pattern in &patterns {
            if let Ok(entries) = glob::glob(pattern) {
                files.extend(entries.filter_map(Result::ok));
            }
        }
        files
    }

    fn generate_vscode_workspace(
        project_dir: &Path,
        project_path: &Path,
        clangd_path: &Path,
    ) -> Result<()> {
        let workspace_path = Self::vscode_workspace_path(project_dir, project_path);
        let mut workspace = if workspace_path.exists() {
            Self::read_json_object(&workspace_path)?
        } else {
            serde_json::Map::new()
        };

        workspace
            .entry("folders".to_string())
            .or_insert_with(|| serde_json::json!([{ "path": "." }]));

        let mut settings = Self::workspace_object(&workspace, "settings")?;
        settings.extend([
            (
                "C_Cpp.default.compileCommands".to_string(),
                serde_json::json!("${workspaceFolder}/compile_commands.json"),
            ),
            (
                "C_Cpp.intelliSenseEngine".to_string(),
                serde_json::json!("disabled"),
            ),
            (
                "clangd.arguments".to_string(),
                serde_json::json!([
                    "--compile-commands-dir=${workspaceFolder}",
                    "--background-index",
                    "--j=8",
                    "--index-store-path=.clangd/index",
                    "--pch-storage=disk",
                    "--limit-results=200",
                    "--header-insertion=iwyu"
                ]),
            ),
            (
                "clangd.path".to_string(),
                serde_json::json!(clangd_path.to_string_lossy()),
            ),
        ]);
        workspace.insert("settings".to_string(), serde_json::Value::Object(settings));

        let generated_tasks = serde_json::json!({
            "version": "2.0.0",
            "tasks": [
                {
                    "label": "ubuild: Build Project",
                    "type": "shell",
                    "command": "ubuild",
                    "args": ["build"],
                    "group": "build",
                    "problemMatcher": ["$msCompile"],
                    "detail": "Build Unreal Engine project using ubuild"
                },
                {
                    "label": "ubuild: Run Project",
                    "type": "shell",
                    "command": "ubuild",
                    "args": ["run", "--build-first"],
                    "group": "build",
                    "detail": "Build and run Unreal Engine project using ubuild"
                }
            ]
        });
        let mut tasks = Self::workspace_object(&workspace, "tasks")?;
        Self::merge_generated_tasks(&mut tasks, &generated_tasks)?;

        workspace.insert("tasks".to_string(), serde_json::Value::Object(tasks));

        let json = serde_json::to_string_pretty(&workspace)?;
        atomic_write(&workspace_path, json)?;

        Ok(())
    }

    fn read_json_object(path: &Path) -> Result<serde_json::Map<String, serde_json::Value>> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read {}", path.display()))?;
        serde_json::from_str(&content)
            .with_context(|| format!("Failed to parse JSON object {}", path.display()))
    }

    fn workspace_object(
        workspace: &serde_json::Map<String, serde_json::Value>,
        key: &str,
    ) -> Result<serde_json::Map<String, serde_json::Value>> {
        match workspace.get(key) {
            None => Ok(serde_json::Map::new()),
            Some(serde_json::Value::Object(value)) => Ok(value.clone()),
            Some(_) => anyhow::bail!("VSCode workspace field '{key}' must be an object"),
        }
    }

    fn merge_generated_tasks(
        tasks: &mut serde_json::Map<String, serde_json::Value>,
        generated: &serde_json::Value,
    ) -> Result<()> {
        let generated_tasks = generated
            .get("tasks")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| anyhow::anyhow!("Generated VSCode tasks are not an array"))?;
        let task_list = tasks
            .entry("tasks".to_string())
            .or_insert_with(|| serde_json::Value::Array(Vec::new()));
        let Some(task_list) = task_list.as_array_mut() else {
            anyhow::bail!("VSCode workspace field 'tasks.tasks' must be an array");
        };

        for generated_task in generated_tasks {
            let generated_label = generated_task
                .get("label")
                .and_then(serde_json::Value::as_str);
            if let Some(label) = generated_label {
                if let Some(existing) = task_list.iter_mut().find(|task| {
                    task.get("label")
                        .and_then(serde_json::Value::as_str)
                        .is_some_and(|existing_label| existing_label == label)
                }) {
                    *existing = generated_task.clone();
                    continue;
                }
            }
            task_list.push(generated_task.clone());
        }
        tasks.insert("version".to_string(), serde_json::json!("2.0.0"));
        Ok(())
    }

    fn vscode_workspace_path(project_dir: &Path, project_path: &Path) -> PathBuf {
        project_dir.join(format!(
            "{}.code-workspace",
            ProjectPathResolver::project_name(project_path)
        ))
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use anyhow::Result;
    use tempfile::tempdir;

    use super::ProjectGenerator;

    #[test]
    fn embeds_vscode_settings_and_tasks_in_workspace() -> Result<()> {
        let directory = tempdir()?;
        let project_path = directory.path().join("Game.uproject");
        let workspace_path = directory.path().join("Game.code-workspace");
        fs::write(&project_path, "{}")?;
        fs::write(
            &workspace_path,
            r#"{
                "folders": [{"path": "."}],
                "settings": {"custom.setting": true},
                "extensions": {"recommendations": ["llvm-vs-code-extensions.vscode-clangd"]}
            }"#,
        )?;

        ProjectGenerator::generate_vscode_workspace(
            directory.path(),
            &project_path,
            Path::new("clangd"),
        )?;

        let content = fs::read_to_string(&workspace_path)?;
        let workspace: serde_json::Value = serde_json::from_str(&content)?;
        assert_eq!(workspace["settings"]["custom.setting"], true);
        assert_eq!(
            workspace["settings"]["C_Cpp.intelliSenseEngine"],
            "disabled"
        );
        assert_eq!(workspace["tasks"]["version"], "2.0.0");
        assert!(workspace["tasks"]["tasks"].is_array());
        assert_eq!(
            workspace["extensions"]["recommendations"][0],
            "llvm-vs-code-extensions.vscode-clangd"
        );
        assert!(!directory.path().join(".vscode/settings.json").exists());
        assert!(!directory.path().join(".vscode/tasks.json").exists());
        Ok(())
    }

    #[test]
    fn creates_project_workspace_when_ubt_did_not_create_one() -> Result<()> {
        let directory = tempdir()?;
        let project_path = directory.path().join("Game.uproject");
        fs::write(&project_path, "{}")?;

        ProjectGenerator::generate_vscode_workspace(
            directory.path(),
            &project_path,
            Path::new("clangd"),
        )?;

        let workspace_path = directory.path().join("Game.code-workspace");
        let content = fs::read_to_string(workspace_path)?;
        let workspace: serde_json::Value = serde_json::from_str(&content)?;
        assert_eq!(workspace["folders"][0]["path"], ".");
        Ok(())
    }
}
