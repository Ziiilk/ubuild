use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{Context, Result};

use crate::error::UbuildError;
use crate::platform;
use crate::utils::logger::Logger;

use super::build_executor::BuildExecutor;
use super::engine_resolver::EngineResolver;
use super::project_path_resolver::ProjectPathResolver;
use super::target_resolver::TargetResolver;

pub struct ProjectRunner;

impl ProjectRunner {
    pub fn run(
        target: &str,
        config: &str,
        platform: &str,
        project: Option<&str>,
        engine_path: Option<&str>,
        dry_run: bool,
        build_first: bool,
        no_build: bool,
        detached: bool,
        extra_args: &[String],
    ) -> Result<()> {
        Logger::title("Run Unreal Engine Project");

        if dry_run {
            return Self::dry_run(
                target,
                config,
                platform,
                project,
                engine_path,
                build_first,
                detached,
                extra_args,
            );
        }

        let (project_path, engine) =
            EngineResolver::resolve_project_and_engine(project, engine_path)?;

        if !no_build && build_first {
            Logger::info("Building project before running...");
            let result = BuildExecutor::execute(
                target, config, platform,
                Some(project_path.to_str().unwrap_or("")),
                Some(engine.to_str().unwrap_or("")),
                false, false, &[],
            )?;
            if !result.success {
                anyhow::bail!("Build failed with exit code {}", result.exit_code);
            }
            Logger::divider();
        }

        let exec_path = Self::find_executable(target, platform, &project_path, &engine);
        if !exec_path.exists() {
            return Err(UbuildError::ExecutableNotFound(exec_path).into());
        }

        let basename = exec_path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        Logger::info(&format!("Running: {basename}"));
        Logger::divider();

        let args = Self::build_launch_args(target, &project_path, extra_args);

        if detached {
            let mut child = Command::new(&exec_path)
                .args(&args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .with_context(|| format!("Failed to start {basename}"))?;

            // Detach: don't wait
            drop(child.stdout.take());
            drop(child.stderr.take());
            Logger::success(&format!("Started process in detached mode: {basename}"));
        } else {
            let mut child = Command::new(&exec_path)
                .args(&args)
                .stdin(Stdio::inherit())
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .spawn()
                .with_context(|| format!("Failed to run {basename}"))?;

            // Kill the spawned executable when the user presses Ctrl+C so the
            // editor/game does not keep running after ubuild is interrupted.
            let pid = child.id();
            let _ = ctrlc::set_handler(move || platform::kill_process(pid));

            let status = child
                .wait()
                .with_context(|| format!("Failed to wait for {basename}"))?;

            Logger::divider();
            let code = status.code().unwrap_or(-1);
            if status.success() {
                Logger::success(&format!("Process exited with code {code}"));
            } else {
                Logger::error(&format!("Process exited with code {code}"));
            }
        }

        Ok(())
    }

    fn find_executable(
        target: &str,
        platform: &str,
        project_path: &Path,
        engine_path: &Path,
    ) -> PathBuf {
        let project_dir = ProjectPathResolver::project_dir(project_path);
        let project_name = ProjectPathResolver::project_name(project_path);
        let ext = platform::exe_extension();

        let lower_target = target.to_lowercase();
        if lower_target.contains("editor") {
            let candidates = [
                engine_path
                    .join("Engine/Binaries")
                    .join(platform)
                    .join(format!("UnrealEditor{ext}")),
                engine_path
                    .join("Engine/Binaries")
                    .join(platform)
                    .join(format!("UnrealEditor-Cmd{ext}")),
                engine_path
                    .join("Engine/Binaries")
                    .join(platform)
                    .join(format!("UE4Editor{ext}")),
            ];

            for c in &candidates {
                if c.exists() {
                    return c.clone();
                }
            }
            // Return first candidate as fallback path
            return candidates[0].clone();
        }

        let available = TargetResolver::find_available_targets(project_path);
        let resolved = TargetResolver::resolve_from_list(target, &available);

        let candidates = [
            project_dir
                .join("Binaries")
                .join(platform)
                .join(format!("{project_name}{ext}")),
            project_dir
                .join("Binaries")
                .join(platform)
                .join(format!("{resolved}{ext}")),
        ];

        for c in &candidates {
            if c.exists() {
                return c.clone();
            }
        }

        candidates[0].clone()
    }

    fn build_launch_args(target: &str, project_path: &Path, extra_args: &[String]) -> Vec<String> {
        let mut args: Vec<String> = Vec::new();
        if target.to_lowercase().contains("editor") {
            args.push(project_path.to_string_lossy().to_string());
            // Skip the editor's own module up-to-date check on startup; ubuild
            // already builds (or the binaries are assumed current), so let the
            // editor go straight to loading instead of re-validating modules.
            args.push("-skipcompile".to_string());
        }
        args.extend(extra_args.iter().cloned());
        args
    }

    fn dry_run(
        target: &str,
        config: &str,
        platform: &str,
        project: Option<&str>,
        engine_path: Option<&str>,
        build_first: bool,
        detached: bool,
        extra_args: &[String],
    ) -> Result<()> {
        Logger::subtitle("Dry Run - Run Configuration");

        let (project_path, engine) =
            EngineResolver::resolve_project_and_engine(project, engine_path)?;

        Logger::info(&format!("Project: {}", project_path.display()));
        Logger::info(&format!("Target: {target}"));
        Logger::info(&format!("Configuration: {config}"));
        Logger::info(&format!("Platform: {platform}"));
        Logger::info(&format!("Build First: {build_first}"));
        Logger::info(&format!("Detached: {detached}"));
        if !extra_args.is_empty() {
            Logger::info(&format!("Args: {}", extra_args.join(" ")));
        }

        let exec_path = Self::find_executable(target, platform, &project_path, &engine);
        let exists = exec_path.exists();
        Logger::info(&format!(
            "Executable: {}, exists: {}",
            exec_path.display(),
            if exists { "Yes" } else { "No (may need build)" }
        ));

        let launch_args = Self::build_launch_args(target, &project_path, extra_args);
        Logger::info(&format!("Launch args: {}", launch_args.join(" ")));

        Logger::info("This is a dry run - no actual run will be performed");
        Ok(())
    }
}
