use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::Result;

use crate::error::UbuildError;
use crate::platform;
use crate::utils::logger::Logger;

use super::engine_resolver::EngineResolver;
use super::process_runner::ProcessRunner;
use super::project_builder::ProjectBuilder;
use super::project_path_resolver::ProjectPathResolver;

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
        extra_args: &[String],
    ) -> Result<()> {
        let should_build = build_first && !no_build;

        if dry_run {
            return Self::dry_run(config, platform, project, engine_path, extra_args);
        }

        let (project_path, engine) =
            EngineResolver::resolve_project_and_engine(project, engine_path)?;

        if should_build {
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
        }

        let exec_path = Self::find_editor_executable(platform, &engine);
        if !exec_path.exists() {
            return Err(UbuildError::ExecutableNotFound(exec_path).into());
        }

        let args = Self::build_launch_args(&project_path, extra_args);
        let command_line = Self::launch_command(&exec_path, &args);
        Logger::operation_header(
            &command_line,
            &project_path,
            &engine.display().to_string(),
            platform,
            config,
        );

        let mut command = Command::new(&exec_path);
        command.args(&args);
        let code = ProcessRunner::forward_collapsible(&mut command, "Unreal log")?;

        Self::validate_exit_code(code)?;
        Logger::success(&format!("Process exited with code {code}"));
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
        if !extra_args
            .iter()
            .any(|arg| arg.eq_ignore_ascii_case("-stdout"))
        {
            args.push("-stdout".to_string());
        }
        if !extra_args
            .iter()
            .any(|arg| arg.eq_ignore_ascii_case("-FullStdOutLogOutput"))
        {
            args.push("-FullStdOutLogOutput".to_string());
        }
        args.extend(extra_args.iter().cloned());
        args
    }

    /// The full editor launch command line (executable + args, single-space
    /// joined), for use as the first header line.
    pub(crate) fn launch_command(exec_path: &Path, args: &[String]) -> String {
        crate::utils::command::join_command_line(exec_path, args)
    }

    fn validate_exit_code(code: i32) -> Result<()> {
        if code == 0 {
            Ok(())
        } else {
            anyhow::bail!("Process exited with code {code}");
        }
    }

    fn dry_run(
        config: &str,
        platform: &str,
        project: Option<&str>,
        engine_path: Option<&str>,
        extra_args: &[String],
    ) -> Result<()> {
        let project_path = ProjectPathResolver::resolve_or_throw(project)?;

        let (engine_display, command) =
            match EngineResolver::resolve_engine_path(Some(&project_path), engine_path) {
                Ok(engine) => {
                    let exec_path = Self::find_editor_executable(platform, &engine);
                    let args = Self::build_launch_args(&project_path, extra_args);
                    (
                        engine.display().to_string(),
                        Self::launch_command(&exec_path, &args),
                    )
                }
                Err(_) => (
                    "Not detected".to_string(),
                    "(run command unavailable - engine not detected)".to_string(),
                ),
            };

        Logger::operation_header(&command, &project_path, &engine_display, platform, config);
        Logger::plain_line("Dry run - no run will be performed");
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
            [
                "C:/Project/Game.uproject",
                "-skipcompile",
                "-stdout",
                "-FullStdOutLogOutput",
                "-game",
                "-log"
            ]
        );
    }

    #[test]
    fn does_not_duplicate_explicit_log_arguments() {
        let extra_args = vec![
            "-STDOUT".to_string(),
            "-fullstdoutlogoutput".to_string(),
            "-game".to_string(),
        ];

        let args =
            ProjectRunner::build_launch_args(Path::new("C:/Project/Game.uproject"), &extra_args);

        assert_eq!(
            args,
            [
                "C:/Project/Game.uproject",
                "-skipcompile",
                "-STDOUT",
                "-fullstdoutlogoutput",
                "-game"
            ]
        );
    }

    #[test]
    fn nonzero_process_exit_is_an_error() {
        assert!(ProjectRunner::validate_exit_code(1).is_err());
        assert!(ProjectRunner::validate_exit_code(0).is_ok());
    }

    #[test]
    fn launch_command_joins_executable_and_args() {
        let command = ProjectRunner::launch_command(
            Path::new("D:/Engine/Binaries/Win64/UnrealEditor.exe"),
            &[
                "C:/Project/Game.uproject".to_string(),
                "-skipcompile".to_string(),
                "-stdout".to_string(),
            ],
        );

        assert_eq!(
            command,
            "D:/Engine/Binaries/Win64/UnrealEditor.exe \
             C:/Project/Game.uproject -skipcompile -stdout"
        );
    }
}
