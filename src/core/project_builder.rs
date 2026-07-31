use anyhow::Result;

use crate::utils::logger::Logger;

use super::build_executor::BuildExecutor;
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
        Logger::title("Unreal Engine Build");

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

        Logger::info(&format!("Preparing to build: {platform} | {config}"));
        Logger::divider();

        let result = BuildExecutor::execute(
            config,
            platform,
            project,
            engine_path,
            clean,
            verbose,
            ubt_args,
        )?;

        Logger::divider();

        let duration_secs = result.duration.as_secs_f64();
        if result.success {
            Logger::success(&format!("Build completed in {duration_secs:.1}s"));
        } else {
            Logger::error(&format!(
                "Build failed (exit code {}) after {duration_secs:.1}s",
                result.exit_code
            ));
            Logger::print_error_summary(&result.stdout, &result.stderr);
            anyhow::bail!("Build failed with exit code {}", result.exit_code);
        }

        Ok(())
    }

    fn dry_run_build(
        config: &str,
        platform: &str,
        project: Option<&str>,
        _engine_path: Option<&str>,
        clean: bool,
        verbose: bool,
        ubt_args: &[String],
    ) -> Result<()> {
        Logger::subtitle("Dry Run - Build Configuration");

        let project_path = ProjectPathResolver::resolve_or_throw(project)?;

        Logger::info(&format!("Project: {}", project_path.display()));
        Logger::info(&format!("Configuration: {config}"));
        Logger::info(&format!("Platform: {platform}"));
        Logger::info(&format!("Clean: {clean}"));
        Logger::info(&format!("Verbose: {verbose}"));
        if !ubt_args.is_empty() {
            Logger::info(&format!("UBT args: {}", ubt_args.join(" ")));
        }

        EngineResolver::write_engine_status(Some(&project_path));

        Logger::info("This is a dry run - no actual build will be performed");
        Logger::writeln("  To execute the build, remove the --dry-run flag");
        Ok(())
    }
}
