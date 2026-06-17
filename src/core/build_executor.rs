use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Instant;

use anyhow::{Context, Result};

use crate::error::UbuildError;
use crate::types::{defaults, BuildResult, ResolvedTarget};
use crate::utils::logger::Logger;
use crate::utils::unreal_paths::{resolve_build_bat_path, resolve_ubt_path};

use super::engine_resolver::EngineResolver;
use super::project_path_resolver::ProjectPathResolver;
use super::target_resolver::TargetResolver;

pub struct BuildExecutor;

impl BuildExecutor {
    pub fn execute(
        target: &str,
        config: &str,
        platform: &str,
        project_path: Option<&str>,
        engine_path: Option<&str>,
        clean: bool,
        verbose: bool,
        additional_args: &[String],
    ) -> Result<BuildResult> {
        let start = Instant::now();

        let (project, engine) =
            EngineResolver::resolve_project_and_engine(project_path, engine_path)?;

        // Resolve target name
        let available_targets = TargetResolver::find_available_targets(&project);
        let resolved_target = if available_targets.is_empty() {
            Logger::debug("No target files found, using generic target name");
            target.to_string()
        } else {
            let resolved = TargetResolver::resolve_from_list(target, &available_targets);
            if TargetResolver::is_generic(target)
                && !available_targets.iter().any(|t| t.target_type == target)
                && resolved == target
            {
                return Err(UbuildError::TargetNotFound {
                    target: target.to_string(),
                    available: available_targets.iter().map(|t| t.name.clone()).collect(),
                }
                .into());
            }
            if resolved != target {
                Logger::debug(&format!("Resolved target \"{target}\" to \"{resolved}\""));
            }
            resolved
        };

        Logger::info(&format!(
            "Starting build: {resolved_target} | {platform} | {config}"
        ));
        Logger::info(&format!("Project: {}", project.display()));
        Logger::info(&format!("Engine: {}", engine.display()));

        // Prefer Build.bat, fallback to UBT directly
        let executable = match resolve_build_bat_path(&engine) {
            Some(bat) => bat,
            None => resolve_ubt_path(&engine)?,
        };

        let args = Self::build_args(
            &resolved_target,
            config,
            platform,
            &project,
            clean,
            verbose,
            additional_args,
        );

        let (stdout, stderr, exit_code) = Self::execute_streaming(&executable, &args)?;

        // By default UBT logs to the global %LOCALAPPDATA%\UnrealBuildTool\Log.txt
        // to stay close to native behavior. When a concurrent build holds that
        // file, UBT aborts before doing any work. Only in that case, retry once
        // with a per-project log file so parallel builds no longer block.
        let (stdout, stderr, exit_code) =
            if exit_code != 0 && Self::is_log_locked_failure(&stdout, &stderr) {
                let log_path = ProjectPathResolver::project_dir(&project)
                    .join("Saved")
                    .join("UnrealBuildTool")
                    .join("Log.txt");
                Logger::warning(
                    "Global UnrealBuildTool log is locked by another build; \
                     retrying with a per-project log file",
                );

                let mut retry_args = args.clone();
                retry_args.push(format!("-Log={}", log_path.display()));
                Self::execute_streaming(&executable, &retry_args)?
            } else {
                (stdout, stderr, exit_code)
            };

        let duration = start.elapsed();

        Ok(BuildResult {
            success: exit_code == 0,
            exit_code,
            stdout,
            stderr,
            duration,
        })
    }

    /// Detect the UBT failure where the global log file could not be rotated
    /// because another process holds it open.
    fn is_log_locked_failure(stdout: &str, stderr: &str) -> bool {
        let mentions_backup =
            stdout.contains("BackupLogFile") || stderr.contains("BackupLogFile");
        let mentions_lock = stdout.contains("being used by another process")
            || stderr.contains("being used by another process");
        mentions_backup && mentions_lock
    }

    fn build_args(
        target: &str,
        config: &str,
        platform: &str,
        project_path: &Path,
        clean: bool,
        verbose: bool,
        additional_args: &[String],
    ) -> Vec<String> {
        let mut args = vec![
            target.to_string(),
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
        args.extend(additional_args.iter().cloned());
        args
    }

    fn execute_streaming(
        executable: &Path,
        args: &[String],
    ) -> Result<(String, String, i32)> {
        Logger::debug(&format!(
            "Executing: {} {}",
            executable.display(),
            args.join(" ")
        ));

        let cwd = executable
            .parent()
            .unwrap_or_else(|| Path::new("."));

        let mut child = Command::new(executable)
            .args(args)
            .current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| format!("Failed to start {}", executable.display()))?;

        let mut stdout_buf = String::new();
        let mut stderr_buf = String::new();

        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                println!("  {line}");
                stdout_buf.push_str(&line);
                stdout_buf.push('\n');
            }
        }

        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("  {line}");
                stderr_buf.push_str(&line);
                stderr_buf.push('\n');
            }
        }

        let status = child.wait().context("Failed to wait for build process")?;
        let exit_code = status.code().unwrap_or(-1);

        Ok((stdout_buf, stderr_buf, exit_code))
    }

    pub fn get_available_targets(project_path: &Path) -> Vec<ResolvedTarget> {
        TargetResolver::find_available_targets(project_path)
    }

    pub fn get_default_options(project_path: &Path) -> (&'static str, &'static str, &'static str) {
        let targets = Self::get_available_targets(project_path);
        let target = if targets.iter().any(|t| t.target_type == "Editor") {
            "Editor"
        } else {
            "Game"
        };
        (target, defaults::BUILD_CONFIG, defaults::BUILD_PLATFORM)
    }
}
