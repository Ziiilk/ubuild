use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Instant;

use anyhow::{Context, Result};

use crate::types::BuildResult;
use crate::utils::command::append_ubt_target_selection;
use crate::utils::logger::Logger;
use crate::utils::unreal_paths::{resolve_build_bat_path, resolve_ubt_path};

use super::engine_resolver::EngineResolver;
use super::project_path_resolver::ProjectPathResolver;

pub struct BuildExecutor;

impl BuildExecutor {
    pub fn execute(
        config: &str,
        platform: &str,
        project_path: Option<&str>,
        engine_path: Option<&str>,
        clean: bool,
        verbose: bool,
        ubt_args: &[String],
    ) -> Result<BuildResult> {
        let start = Instant::now();

        let (project, engine) =
            EngineResolver::resolve_project_and_engine(project_path, engine_path)?;

        Logger::info(&format!("Starting build: {platform} | {config}"));
        Logger::info(&format!("Project: {}", project.display()));
        Logger::info(&format!("Engine: {}", engine.display()));

        // Prefer Build.bat, fallback to UBT directly
        let executable = match resolve_build_bat_path(&engine) {
            Some(bat) => bat,
            None => resolve_ubt_path(&engine)?,
        };

        let args = Self::build_args(config, platform, &project, clean, verbose, ubt_args);

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
        let mentions_backup = stdout.contains("BackupLogFile") || stderr.contains("BackupLogFile");
        let mentions_lock = stdout.contains("being used by another process")
            || stderr.contains("being used by another process");
        mentions_backup && mentions_lock
    }

    fn build_args(
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

    pub(crate) fn execute_streaming(
        executable: &Path,
        args: &[String],
    ) -> Result<(String, String, i32)> {
        Logger::debug(&format!(
            "Executing: {} {}",
            executable.display(),
            args.join(" ")
        ));

        let cwd = executable.parent().unwrap_or_else(|| Path::new("."));

        let mut child = Command::new(executable)
            .args(args)
            .current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| format!("Failed to start {}", executable.display()))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture process stdout"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture process stderr"))?;

        let (stdout_buf, stderr_buf) = std::thread::scope(|scope| {
            let stdout_handle = scope.spawn(|| Self::read_stream(stdout, false));
            let stderr_handle = scope.spawn(|| Self::read_stream(stderr, true));
            let stdout_buf = stdout_handle
                .join()
                .map_err(|_| anyhow::anyhow!("stdout reader thread panicked"))?;
            let stderr_buf = stderr_handle
                .join()
                .map_err(|_| anyhow::anyhow!("stderr reader thread panicked"))?;
            Ok::<_, anyhow::Error>((stdout_buf, stderr_buf))
        })?;

        let status = child.wait().context("Failed to wait for build process")?;
        let exit_code = status.code().unwrap_or(-1);

        Ok((stdout_buf, stderr_buf, exit_code))
    }

    fn read_stream(stream: impl std::io::Read, is_stderr: bool) -> String {
        let mut buffer = String::new();
        for line in BufReader::new(stream).lines().map_while(Result::ok) {
            if is_stderr {
                eprintln!("  {line}");
            } else {
                println!("  {line}");
            }
            buffer.push_str(&line);
            buffer.push('\n');
        }
        buffer
    }
}
