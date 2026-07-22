use std::path::Path;
use std::time::Instant;

use anyhow::Result;

use crate::platform;
use crate::utils::command::display_args;
use crate::utils::logger::Logger;
use crate::utils::unreal_paths::resolve_runuat_path;

use super::build_executor::BuildExecutor;
use super::engine_resolver::EngineResolver;

pub struct InstalledBuildExecutor;

impl InstalledBuildExecutor {
    pub fn run(
        engine_path: Option<&str>,
        output_dir: Option<&str>,
        all_platforms: bool,
        platforms: &[String],
        configs: &[String],
        no_ddc: bool,
        clean: bool,
        verbose: bool,
        dry_run: bool,
        uat_args: &[String],
    ) -> Result<()> {
        Logger::title("Unreal Engine Installed Build");

        let engine = EngineResolver::resolve_engine_path(None, engine_path)?;
        let runuat = resolve_runuat_path(&engine)?;

        let script = engine
            .join("Engine")
            .join("Build")
            .join("InstalledEngineBuild.xml");
        if !script.exists() {
            anyhow::bail!(
                "InstalledEngineBuild.xml not found at {}. \
                 Installed builds require a source-built engine.",
                script.display()
            );
        }

        let target = Self::host_target_name();
        let args = Self::build_args(
            &script,
            &target,
            output_dir,
            all_platforms,
            platforms,
            configs,
            no_ddc,
            clean,
            verbose,
            uat_args,
        );

        Logger::info(&format!("Engine: {}", engine.display()));
        Logger::info(&format!("Target: {target}"));
        if let Some(out) = output_dir {
            Logger::info(&format!("Output: {out}"));
        }

        if dry_run {
            Logger::subtitle("Dry Run - RunUAT Command");
            Logger::writeln(&format!("  {} {}", runuat.display(), display_args(&args)));
            Logger::info("This is a dry run - no build will be performed");
            return Ok(());
        }

        Logger::warning(
            "Installed Build compiles the entire engine and can take a very long time.",
        );
        Logger::divider();

        let start = Instant::now();
        let (stdout, stderr, exit_code) = BuildExecutor::execute_streaming(&runuat, &args)?;
        let duration = start.elapsed().as_secs_f64();

        Logger::divider();

        if exit_code == 0 {
            Logger::success(&format!("Installed build completed in {duration:.1}s"));
            return Ok(());
        }

        Logger::error(&format!(
            "Installed build failed (exit code {exit_code}) after {duration:.1}s"
        ));
        Logger::print_error_summary(&stdout, &stderr);

        anyhow::bail!("Installed build failed with exit code {exit_code}");
    }

    fn host_target_name() -> String {
        format!("Make Installed Build {}", platform::host_target_platform())
    }

    fn build_args(
        script: &Path,
        target: &str,
        output_dir: Option<&str>,
        all_platforms: bool,
        platforms: &[String],
        configs: &[String],
        no_ddc: bool,
        clean: bool,
        verbose: bool,
        uat_args: &[String],
    ) -> Vec<String> {
        let mut args = vec![
            "BuildGraph".to_string(),
            format!("-Script={}", script.display()),
            format!("-Target={target}"),
        ];

        if platforms.is_empty() {
            if !all_platforms {
                args.push("-set:HostPlatformOnly=true".to_string());
            }
        } else {
            args.push("-set:HostPlatformOnly=false".to_string());
            for p in platforms {
                args.push(format!("-set:With{p}=true"));
            }
        }

        if !configs.is_empty() {
            args.push(format!("-set:GameConfigurations={}", configs.join(";")));
        }
        if no_ddc {
            args.push("-set:WithDDC=false".to_string());
        }
        if let Some(out) = output_dir {
            args.push(format!("-set:BuiltDirectory={out}"));
        }
        if clean {
            args.push("-Clean".to_string());
        }
        if verbose {
            args.push("-verbose".to_string());
        }

        args.extend(uat_args.iter().cloned());
        args
    }
}
