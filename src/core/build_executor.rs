use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use anyhow::Result;

use crate::types::BuildResult;
use crate::utils::command::append_ubt_target_selection;
use crate::utils::logger::Logger;
use crate::utils::unreal_paths::{resolve_build_bat_path, resolve_ubt_path};

use super::engine_resolver::EngineResolver;
use super::process_runner::ProcessRunner;
use super::project_path_resolver::ProjectPathResolver;

/// Resolved inputs for a single build invocation, ready to print or execute.
pub(crate) struct BuildPlan {
    executable: PathBuf,
    args: Vec<String>,
    pub(crate) project: PathBuf,
    pub(crate) engine: PathBuf,
}

impl BuildPlan {
    /// The full command line (executable + args, single-space joined) exactly
    /// as it will be executed, for use as the first header line.
    pub(crate) fn command(&self) -> String {
        crate::utils::command::join_command_line(&self.executable, &self.args)
    }
}

pub struct BuildExecutor;

impl BuildExecutor {
    /// Resolve the project, engine and UBT command without printing or running.
    pub(crate) fn resolve(
        config: &str,
        platform: &str,
        project_path: Option<&str>,
        engine_path: Option<&str>,
        clean: bool,
        verbose: bool,
        ubt_args: &[String],
    ) -> Result<BuildPlan> {
        let (project, engine) =
            EngineResolver::resolve_project_and_engine(project_path, engine_path)?;

        // Prefer Build.bat, fallback to UBT directly.
        let executable = match resolve_build_bat_path(&engine) {
            Some(bat) => bat,
            None => resolve_ubt_path(&engine)?,
        };
        let args = Self::build_args(config, platform, &project, clean, verbose, ubt_args);

        Ok(BuildPlan {
            executable,
            args,
            project,
            engine,
        })
    }

    /// Run the plan and return the result plus whether a collapsible region
    /// was actually rendered (false when TTY was unsupported or the monitor
    /// failed to start and output streamed line-by-line instead).
    pub(crate) fn run(plan: &BuildPlan) -> Result<(BuildResult, bool)> {
        let start = Instant::now();

        Logger::info(&format!(
            "Build log: {}",
            Self::log_path(&plan.args, &plan.project).display()
        ));
        let attempt = Self::run_process(&plan.executable, &plan.args)?;
        let mut rendered_collapsible = attempt.rendered_collapsible;
        let mut exit_code = attempt.exit_code;

        // By default UBT logs to the global %LOCALAPPDATA%\UnrealBuildTool\Log.txt
        // to stay close to native behavior. When a concurrent build holds that
        // file, UBT aborts before doing any work. Only in that case, retry once
        // with a per-project log file so parallel builds no longer block. The
        // log-lock markers are detected incrementally while streaming (bounded
        // memory), so the captured flag drives the retry decision.
        if exit_code != 0 && attempt.log_locked {
            let log_path = Self::project_log_path(&plan.project);
            Logger::warning(
                "Global UnrealBuildTool log is locked by another build; \
                 retrying with a per-project log file",
            );
            Logger::info(&format!("Build retry log: {}", log_path.display()));

            let mut retry_args = plan.args.clone();
            retry_args.push(format!("-Log={}", log_path.display()));
            let retry = Self::run_process(&plan.executable, &retry_args)?;
            rendered_collapsible = retry.rendered_collapsible;
            exit_code = retry.exit_code;
        }

        let duration = start.elapsed();

        let result = BuildResult {
            success: exit_code == 0,
            exit_code,
            duration,
        };
        Ok((result, rendered_collapsible))
    }

    fn default_log_path(project: &Path) -> PathBuf {
        #[cfg(windows)]
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            return PathBuf::from(local_app_data)
                .join("UnrealBuildTool")
                .join("Log.txt");
        }

        Self::project_log_path(project)
    }

    fn log_path(args: &[String], project: &Path) -> PathBuf {
        args.iter()
            .find_map(|arg| {
                let (key, value) = arg.split_once('=')?;
                if key.trim_start_matches('-').eq_ignore_ascii_case("log") {
                    Some(PathBuf::from(value))
                } else {
                    None
                }
            })
            .unwrap_or_else(|| Self::default_log_path(project))
    }

    fn project_log_path(project: &Path) -> PathBuf {
        ProjectPathResolver::project_dir(project)
            .join("Saved")
            .join("UnrealBuildTool")
            .join("Log.txt")
    }

    /// Resolve the build executable without requiring it to exist (Build.bat
    /// preferred, UBT fallback). Returns `None` when neither is present, so
    /// dry-run output can degrade gracefully instead of erroring.
    pub(crate) fn executable_for_display(engine: &Path) -> Option<PathBuf> {
        resolve_build_bat_path(engine).or_else(|| resolve_ubt_path(engine).ok())
    }

    pub(crate) fn build_args(
        config: &str,
        platform: &str,
        project_path: &Path,
        clean: bool,
        verbose: bool,
        ubt_args: &[String],
    ) -> Vec<String> {
        let mut args = vec![
            platform.to_string(),
            config.to_string(),
            format!("-project={}", project_path.display()),
            "-NoMutex".to_string(),
        ];

        if clean {
            args.push("-clean".to_string());
        }
        if verbose {
            args.push("-verbose".to_string());
        }
        append_ubt_target_selection(&mut args, ubt_args);
        args
    }

    fn run_process(
        executable: &Path,
        args: &[String],
    ) -> Result<crate::core::process_runner::CollapsibleOutput> {
        let cwd = executable.parent().unwrap_or_else(|| Path::new("."));
        let mut command = Command::new(executable);
        command.args(args).current_dir(cwd);
        ProcessRunner::forward_collapsible_capture(&mut command, "Build log")
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use anyhow::Result;
    use tempfile::tempdir;

    use super::BuildExecutor;
    use crate::core::process_runner::log_locked_markers;
    use crate::platform;

    fn write_engine_layout(dir: &Path, with_build_bat: bool) -> Result<()> {
        if with_build_bat {
            let bat_dir = dir.join("Engine").join("Build").join("BatchFiles");
            fs::create_dir_all(&bat_dir)?;
            fs::write(
                bat_dir.join(format!("Build{}", platform::bat_extension())),
                "",
            )?;
        } else {
            let ubt_dir = dir.join("Engine").join("Binaries").join("DotNET");
            fs::create_dir_all(&ubt_dir)?;
            fs::write(
                ubt_dir.join(format!("UnrealBuildTool{}", platform::exe_extension())),
                "",
            )?;
        }
        Ok(())
    }

    #[test]
    fn resolve_prefers_build_bat_for_command_line() -> Result<()> {
        let dir = tempdir()?;
        write_engine_layout(dir.path(), true)?;
        let engine = dir.path().to_string_lossy().to_string();
        let project = dir.path().join("Game.uproject");
        fs::write(&project, "{}")?;

        let plan = BuildExecutor::resolve(
            "Development",
            "Win64",
            Some(&project.to_string_lossy()),
            Some(&engine),
            false,
            false,
            &[],
        )?;
        let command = plan.command();

        assert!(command.contains(&format!("Build{}", platform::bat_extension())));
        assert!(command.contains("Win64"));
        assert!(command.contains("Development"));
        assert!(command.contains("-TargetType=Editor"));
        assert!(!command.contains("UnrealBuildTool"));
        Ok(())
    }

    #[test]
    fn resolve_falls_back_to_ubt_when_build_bat_absent() -> Result<()> {
        let dir = tempdir()?;
        write_engine_layout(dir.path(), false)?;
        let engine = dir.path().to_string_lossy().to_string();
        let project = dir.path().join("Game.uproject");
        fs::write(&project, "{}")?;

        let plan = BuildExecutor::resolve(
            "Development",
            "Win64",
            Some(&project.to_string_lossy()),
            Some(&engine),
            true,
            false,
            &[],
        )?;
        let command = plan.command();

        assert!(command.contains("UnrealBuildTool"));
        assert!(command.contains("-clean"));
        assert!(!command.contains(&format!("Build{}", platform::bat_extension())));
        Ok(())
    }

    #[test]
    fn detects_global_log_lock_failure() {
        assert!(log_locked_markers(
            "Performing BackupLogFile: the process cannot access the file as it is \
             being used by another process",
            "",
        ));
    }

    #[test]
    fn ignores_unrelated_build_failure() {
        assert!(!log_locked_markers(
            "error: module compile failed",
            "fatal error: something went wrong",
        ));
    }

    #[test]
    fn respects_explicit_build_log_path() {
        let project = Path::new(r"D:\Projects\Game\Game.uproject");
        let args = vec![r"-Log=D:\Logs\build.log".to_string()];

        assert_eq!(
            BuildExecutor::log_path(&args, project),
            Path::new(r"D:\Logs\build.log")
        );
    }
}
