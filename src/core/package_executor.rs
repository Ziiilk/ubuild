use std::path::{Path, PathBuf};
use std::time::Instant;

use anyhow::Result;

use crate::types::BUILD_CONFIGS;
use crate::utils::command::{display_args, uat_arg_key};
use crate::utils::logger::Logger;
use crate::utils::unreal_paths::resolve_runuat_path;

use super::build_executor::BuildExecutor;
use super::engine_resolver::EngineResolver;
use super::project_path_resolver::ProjectPathResolver;

pub struct PackageExecutor;

impl PackageExecutor {
    pub fn run(
        project_path: Option<&str>,
        engine_path: Option<&str>,
        platform: &str,
        config: &str,
        output_dir: Option<&str>,
        dry_run: bool,
        uat_args: &[String],
    ) -> Result<()> {
        Logger::title("Unreal Engine Project Package");

        Self::validate_config(config)?;
        Self::validate_uat_args(uat_args)?;

        let project = Self::absolute(ProjectPathResolver::resolve_strict(project_path)?)?;
        let engine = Self::absolute(EngineResolver::resolve_engine_path(
            Some(&project),
            engine_path,
        )?)?;
        let runuat = resolve_runuat_path(&engine)?;
        let output = Self::resolve_output(&project, platform, output_dir)?;

        if output.is_file() {
            anyhow::bail!("Package output path is a file: {}", output.display());
        }

        let args = Self::build_args(&project, platform, config, &output, uat_args);

        Logger::info(&format!("Project: {}", project.display()));
        Logger::info(&format!("Engine: {}", engine.display()));
        Logger::info(&format!("Platform: {platform}"));
        Logger::info(&format!("Configuration: {config}"));
        Logger::info(&format!("Output: {}", output.display()));

        if dry_run {
            Logger::subtitle("Dry Run - RunUAT Command");
            Logger::writeln(&format!("  {} {}", runuat.display(), display_args(&args)));
            Logger::info("This is a dry run - no package will be created");
            return Ok(());
        }

        Logger::divider();
        let start = Instant::now();
        let (stdout, stderr, exit_code) = BuildExecutor::execute_streaming(&runuat, &args)?;
        let duration = start.elapsed().as_secs_f64();
        Logger::divider();

        if exit_code != 0 {
            Logger::error(&format!(
                "Package failed (exit code {exit_code}) after {duration:.1}s"
            ));
            Logger::print_error_summary(&stdout, &stderr);
            anyhow::bail!("Package failed with exit code {exit_code}");
        }

        Logger::success(&format!("Package completed in {duration:.1}s"));
        Logger::info(&format!("Archive: {}", output.display()));
        if !output.is_dir() {
            Logger::warning("UAT succeeded, but the archive directory was not found");
        }
        Ok(())
    }

    fn validate_config(config: &str) -> Result<()> {
        if BUILD_CONFIGS
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(config))
        {
            return Ok(());
        }
        anyhow::bail!(
            "Invalid package configuration: {config}. Expected one of: {}",
            BUILD_CONFIGS.join(", ")
        )
    }

    fn validate_uat_args(args: &[String]) -> Result<()> {
        for arg in args {
            let key = uat_arg_key(arg);
            let conflicts = matches!(
                key.as_str(),
                "project"
                    | "platform"
                    | "targetplatform"
                    | "clientconfig"
                    | "config"
                    | "archivedirectory"
                    | "build"
                    | "cook"
                    | "stage"
                    | "package"
                    | "archive"
                    | "skipbuild"
                    | "skipcook"
                    | "skipstage"
                    | "skippackage"
                    | "skiparchive"
                    | "pak"
                    | "iostore"
                    | "skippak"
                    | "skipiostore"
                    | "unattended"
                    | "utf8output"
                    | "nop4"
            );
            if conflicts {
                anyhow::bail!("UAT argument conflicts with ubuild package: {arg}");
            }
        }
        Ok(())
    }

    fn resolve_output(project: &Path, platform: &str, output_dir: Option<&str>) -> Result<PathBuf> {
        let path = output_dir.map_or_else(
            || {
                ProjectPathResolver::project_dir(project)
                    .join("Saved")
                    .join("Packages")
                    .join(platform)
            },
            PathBuf::from,
        );
        Self::absolute(path)
    }

    fn absolute(path: PathBuf) -> Result<PathBuf> {
        if path.is_absolute() {
            return Ok(path);
        }
        Ok(std::env::current_dir()?.join(path))
    }

    fn build_args(
        project: &Path,
        platform: &str,
        config: &str,
        output: &Path,
        uat_args: &[String],
    ) -> Vec<String> {
        let mut args = vec![
            "BuildCookRun".to_string(),
            format!("-project={}", project.display()),
            format!("-targetplatform={platform}"),
            format!("-clientconfig={config}"),
            "-build".to_string(),
            "-cook".to_string(),
            "-stage".to_string(),
            "-package".to_string(),
            "-pak".to_string(),
            "-iostore".to_string(),
            "-archive".to_string(),
            format!("-archivedirectory={}", output.display()),
            "-unattended".to_string(),
            "-utf8output".to_string(),
            "-nop4".to_string(),
        ];
        args.extend(uat_args.iter().cloned());
        args
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::PackageExecutor;

    #[test]
    fn rejects_managed_uat_arguments_case_insensitively() {
        let args = vec!["-SkipCook".to_string()];
        let error = PackageExecutor::validate_uat_args(&args)
            .expect_err("managed argument should be rejected");
        assert!(error.to_string().contains("-SkipCook"));
    }

    #[test]
    fn accepts_unmanaged_uat_arguments() {
        let args = vec!["-compressed".to_string()];
        assert!(PackageExecutor::validate_uat_args(&args).is_ok());
    }

    #[test]
    fn accepts_native_uat_target_routing_arguments() {
        for arg in [
            "-target=MyProjectServer",
            "-server",
            "-noclient",
            "-serverconfig=Shipping",
        ] {
            assert!(PackageExecutor::validate_uat_args(&[arg.to_string()]).is_ok());
        }
    }

    #[test]
    fn rejects_managed_container_arguments() {
        for arg in ["-pak", "-iostore", "-skippak", "-skipiostore"] {
            let error = PackageExecutor::validate_uat_args(&[arg.to_string()])
                .expect_err("managed container argument should be rejected");
            assert!(error.to_string().contains(arg));
        }
    }

    #[test]
    fn builds_complete_package_pipeline() {
        let args = PackageExecutor::build_args(
            Path::new("C:/Project/Game.uproject"),
            "Win64",
            "Shipping",
            Path::new("C:/Output"),
            &[],
        );
        for required in [
            "BuildCookRun",
            "-build",
            "-cook",
            "-stage",
            "-package",
            "-pak",
            "-iostore",
            "-archive",
            "-unattended",
            "-utf8output",
            "-nop4",
        ] {
            assert!(args.iter().any(|arg| arg == required));
        }
    }
}
