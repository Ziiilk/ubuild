
use anyhow::Result;
use console::style;

use crate::utils::logger::Logger;

use super::build_executor::BuildExecutor;
use super::engine_resolver::EngineResolver;
use super::project_path_resolver::ProjectPathResolver;

pub struct ProjectBuilder;

impl ProjectBuilder {
    pub fn build(
        target: &str,
        config: &str,
        platform: &str,
        project: Option<&str>,
        engine_path: Option<&str>,
        clean: bool,
        verbose: bool,
        dry_run: bool,
        list_targets: bool,
    ) -> Result<()> {
        Logger::title("Unreal Engine Build");

        if list_targets {
            return Self::list_available_targets(project);
        }

        if dry_run {
            return Self::dry_run_build(target, config, platform, project, engine_path, clean, verbose);
        }

        Logger::info(&format!(
            "Preparing to build: {target} | {platform} | {config}"
        ));
        Logger::divider();

        let result = BuildExecutor::execute(
            target,
            config,
            platform,
            project,
            engine_path,
            clean,
            verbose,
            &[],
        )?;

        Logger::divider();

        let duration_secs = result.duration.as_secs_f64();
        if result.success {
            Logger::success(&format!("Build completed in {duration_secs:.1}s"));
        } else {
            // Extract error lines
            let error_lines: Vec<&str> = result
                .stderr
                .lines()
                .chain(result.stdout.lines())
                .filter(|l| {
                    let lower = l.to_lowercase();
                    lower.contains("error") || lower.contains("failed") || lower.contains("fatal")
                })
                .take(10)
                .collect();

            Logger::error(&format!(
                "Build failed (exit code {}) after {duration_secs:.1}s",
                result.exit_code
            ));

            if !error_lines.is_empty() {
                Logger::subtitle("Error Summary:");
                for line in &error_lines {
                    Logger::writeln(&format!("  {}", style(line).red()));
                }
            }

            anyhow::bail!("Build failed with exit code {}", result.exit_code);
        }

        Ok(())
    }

    fn list_available_targets(project: Option<&str>) -> Result<()> {
        Logger::subtitle("Available Build Targets");

        let project_path = ProjectPathResolver::resolve_or_throw(project)?;
        let targets = BuildExecutor::get_available_targets(&project_path);

        if targets.is_empty() {
            Logger::writeln("  No build targets found");
            Logger::writeln("  Make sure:");
            Logger::writeln("    • You are in a Unreal Engine project directory");
            Logger::writeln("    • The project has Source/*.Target.cs files");
            Logger::writeln("    • The project is a C++ project");
        } else {
            for t in &targets {
                Logger::writeln(&format!("  • {} ({})", t.name, t.target_type));
            }
        }

        Logger::writeln("");
        Logger::writeln("  Use: ubuild build --target <target>");
        Ok(())
    }

    fn dry_run_build(
        target: &str,
        config: &str,
        platform: &str,
        project: Option<&str>,
        _engine_path: Option<&str>,
        clean: bool,
        verbose: bool,
    ) -> Result<()> {
        Logger::subtitle("Dry Run - Build Configuration");

        let project_path = ProjectPathResolver::resolve_or_throw(project)?;

        Logger::info(&format!("Project: {}", project_path.display()));
        Logger::info(&format!("Target: {target}"));
        Logger::info(&format!("Configuration: {config}"));
        Logger::info(&format!("Platform: {platform}"));
        Logger::info(&format!("Clean: {clean}"));
        Logger::info(&format!("Verbose: {verbose}"));

        EngineResolver::write_engine_status(Some(&project_path));

        Logger::info("This is a dry run - no actual build will be performed");
        Logger::writeln("  To execute the build, remove the --dry-run flag");
        Ok(())
    }
}
