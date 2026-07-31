use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{Context, Result};

use crate::error::UbuildError;
use crate::platform;
use crate::utils::logger::Logger;

use super::engine_resolver::EngineResolver;
use super::project_builder::ProjectBuilder;

pub struct ProjectRunner;

impl ProjectRunner {
    pub fn run(
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
        let should_build = build_first && !no_build;

        if dry_run {
            return Self::dry_run(
                config,
                platform,
                project,
                engine_path,
                should_build,
                detached,
                extra_args,
            );
        }

        let (project_path, engine) =
            EngineResolver::resolve_project_and_engine(project, engine_path)?;

        if should_build {
            Logger::info("Building project before running...");
            let project_arg = project_path.to_string_lossy();
            let engine_arg = engine.to_string_lossy();
            ProjectBuilder::build(
                config,
                platform,
                Some(project_arg.as_ref()),
                Some(engine_arg.as_ref()),
                false,
                false,
                false,
                &[],
            )?;
            Logger::divider();
        }

        let exec_path = Self::find_editor_executable(platform, &engine);
        if !exec_path.exists() {
            return Err(UbuildError::ExecutableNotFound(exec_path).into());
        }

        let basename = exec_path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        Logger::info(&format!("Running: {basename}"));
        Logger::divider();

        let args = Self::build_launch_args(&project_path, extra_args);

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

            let _lifetime_guard = match platform::bind_child_lifetime(&child) {
                Ok(guard) => guard,
                Err(bind_error) => {
                    let cleanup_result = child.kill().and_then(|()| child.wait().map(|_| ()));
                    if let Err(cleanup_error) = cleanup_result {
                        return Err(bind_error.context(format!(
                            "Failed to clean up process after lifecycle binding error: {cleanup_error}"
                        )));
                    }
                    return Err(bind_error);
                }
            };

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

    fn find_editor_executable(platform: &str, engine_path: &Path) -> PathBuf {
        let ext = platform::exe_extension();
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

        candidates[0].clone()
    }

    fn build_launch_args(project_path: &Path, extra_args: &[String]) -> Vec<String> {
        let mut args = vec![
            project_path.to_string_lossy().to_string(),
            "-skipcompile".to_string(),
        ];
        args.extend(extra_args.iter().cloned());
        args
    }

    fn dry_run(
        config: &str,
        platform: &str,
        project: Option<&str>,
        engine_path: Option<&str>,
        should_build: bool,
        detached: bool,
        extra_args: &[String],
    ) -> Result<()> {
        Logger::subtitle("Dry Run - Run Configuration");

        let (project_path, engine) =
            EngineResolver::resolve_project_and_engine(project, engine_path)?;

        Logger::info(&format!("Project: {}", project_path.display()));
        Logger::info(&format!("Build First: {should_build}"));
        if should_build {
            Logger::info(&format!("Build Configuration: {config}"));
            Logger::info(&format!("Build Platform: {platform}"));
        }
        Logger::info(&format!("Detached: {detached}"));
        if !extra_args.is_empty() {
            Logger::info(&format!("Args: {}", extra_args.join(" ")));
        }

        let exec_path = Self::find_editor_executable(platform, &engine);
        let exists = exec_path.exists();
        Logger::info(&format!(
            "Executable: {}, exists: {}",
            exec_path.display(),
            if exists { "Yes" } else { "No (may need build)" }
        ));

        let launch_args = Self::build_launch_args(&project_path, extra_args);
        Logger::info(&format!("Launch args: {}", launch_args.join(" ")));

        Logger::info("This is a dry run - no actual run will be performed");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::ProjectRunner;

    #[test]
    fn builds_editor_launch_arguments() {
        let extra_args = vec!["-game".to_string(), "-log".to_string()];

        let args =
            ProjectRunner::build_launch_args(Path::new("C:/Project/Game.uproject"), &extra_args);

        assert_eq!(
            args,
            ["C:/Project/Game.uproject", "-skipcompile", "-game", "-log"]
        );
    }
}
