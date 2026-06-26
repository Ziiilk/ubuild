use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{Context, Result};

use crate::types::GenerateResult;
use crate::utils::logger::Logger;
use crate::utils::unreal_paths::resolve_ubt_path;

use super::engine_resolver::EngineResolver;
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

        let mut child = Command::new(&ubt_path)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| "Failed to run UnrealBuildTool")?;

        if let Some(stdout) = child.stdout.take() {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                println!("  {line}");
            }
        }

        if let Some(stderr) = child.stderr.take() {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                eprintln!("  {line}");
            }
        }

        let status = child.wait()?;
        if !status.success() {
            anyhow::bail!(
                "Project file generation failed with exit code {}",
                status.code().unwrap_or(-1)
            );
        }

        // Find generated files
        let generated = Self::find_generated_files(&project_dir, ide);

        // Generate VSCode tasks if ide is vscode
        if ide == "vscode" {
            Self::generate_vscode_tasks(&project_dir)?;
        }

        Ok(GenerateResult {
            generated_files: generated,
        })
    }

    pub fn list_ides() {
        Logger::subtitle("Available IDE types:");
        let descriptions = [
            ("sln", "Visual Studio Solution (.sln)"),
            ("vs2022", "Visual Studio 2022 project files"),
            ("vscode", "Visual Studio Code with .vscode/ config"),
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

    fn generate_vscode_tasks(project_dir: &Path) -> Result<()> {
        let vscode_dir = project_dir.join(".vscode");
        std::fs::create_dir_all(&vscode_dir)?;

        let tasks_path = vscode_dir.join("tasks.json");

        let tasks = serde_json::json!({
            "version": "2.0.0",
            "tasks": [
                {
                    "label": "ubuild: Build Project",
                    "type": "shell",
                    "command": "ubuild",
                    "args": ["build"],
                    "group": { "kind": "build", "isDefault": true },
                    "problemMatcher": []
                },
                {
                    "label": "ubuild: Run Project",
                    "type": "shell",
                    "command": "ubuild",
                    "args": ["run", "--build-first"],
                    "group": "none",
                    "problemMatcher": []
                }
            ]
        });

        let json = serde_json::to_string_pretty(&tasks)?;
        std::fs::write(&tasks_path, json)?;

        Ok(())
    }
}
