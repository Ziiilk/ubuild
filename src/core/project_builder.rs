use std::path::Path;

use anyhow::Result;

use crate::error::UbuildError;
use crate::utils::command::current_invocation;
use crate::utils::logger::Logger;

use super::build_executor::{BuildExecutor, BuildPlan};
use super::engine_resolver::EngineResolver;
use super::project_path_resolver::ProjectPathResolver;

pub struct ProjectBuilder;

impl ProjectBuilder {
    pub fn build(
        config: &str,
        platform: &str,
        project: Option<&str>,
        engine_path: Option<&str>,
        clean: bool,
        verbose: bool,
        dry_run: bool,
        ubt_args: &[String],
    ) -> Result<()> {
        if dry_run {
            return Self::dry_run_build(
                config,
                platform,
                project,
                engine_path,
                clean,
                verbose,
                ubt_args,
            );
        }

        let plan = BuildExecutor::resolve(
            config,
            platform,
            project,
            engine_path,
            clean,
            verbose,
            ubt_args,
        )?;

        Self::print_header(
            &plan.project,
            &plan.engine.display().to_string(),
            platform,
            config,
        );
        Self::build_phase(&plan)?;
        Ok(())
    }

    /// The build command line + collapsible Build log, with no header. Used by
    /// `build` and `run --build-first` (the latter prints the shared header
    /// once before both phases).
    pub(crate) fn build_phase(plan: &BuildPlan) -> Result<()> {
        Logger::executed_command(&plan.command());

        let (result, rendered_collapsible) = BuildExecutor::run(plan)?;
        let duration_secs = result.duration.as_secs_f64();

        if result.success {
            Logger::success(&format!("Build completed in {duration_secs:.1}s"));
            Ok(())
        } else if rendered_collapsible {
            // The collapsible Build log title already reports the failure and
            // exit code; surface nothing further. Exit code is normalized to 1
            // so it stays identical whether stdout is a TTY or piped.
            Err(UbuildError::ReportedProcessFailure { exit_code: 1 }.into())
        } else {
            anyhow::bail!("Build failed with exit code {}", result.exit_code);
        }
    }

    /// Print the shared normalized header once: the `ubuild` invocation the
    /// user ran, then Project / Engine / Platform.
    pub(crate) fn print_header(project: &Path, engine_display: &str, platform: &str, config: &str) {
        Logger::operation_header(
            &current_invocation(),
            project,
            engine_display,
            platform,
            config,
        );
    }

    fn dry_run_build(
        config: &str,
        platform: &str,
        project: Option<&str>,
        engine_path: Option<&str>,
        clean: bool,
        verbose: bool,
        ubt_args: &[String],
    ) -> Result<()> {
        let project_path = ProjectPathResolver::resolve_or_throw(project)?;

        let (engine_display, command) = Self::dry_run_command(
            config,
            platform,
            &project_path,
            engine_path,
            clean,
            verbose,
            ubt_args,
        );

        Self::print_header(&project_path, &engine_display, platform, config);
        Logger::executed_command(&command);
        Logger::plain_line("Dry run - no build will be performed");
        Ok(())
    }

    /// Build the dry-run command line and engine label, tolerating an
    /// unresolvable engine (prints a readable placeholder instead of erroring).
    fn dry_run_command(
        config: &str,
        platform: &str,
        project_path: &Path,
        engine_path: Option<&str>,
        clean: bool,
        verbose: bool,
        ubt_args: &[String],
    ) -> (String, String) {
        match EngineResolver::resolve_engine_path(Some(project_path), engine_path) {
            Ok(engine) => {
                let args = BuildExecutor::build_args(
                    config,
                    platform,
                    project_path,
                    clean,
                    verbose,
                    ubt_args,
                );
                let command = match BuildExecutor::executable_for_display(&engine) {
                    Some(executable) => {
                        crate::utils::command::join_command_line(&executable, &args)
                    }
                    None => format!("(build executable not found under {})", engine.display()),
                };
                (engine.display().to_string(), command)
            }
            Err(_) => (
                "Not detected".to_string(),
                "(build command unavailable - engine not detected)".to_string(),
            ),
        }
    }
}
