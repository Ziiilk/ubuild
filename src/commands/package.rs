use anyhow::Result;

use crate::cli::PackageArgs;
use crate::core::package_executor::PackageExecutor;

pub fn execute(args: PackageArgs) -> Result<()> {
    PackageExecutor::run(
        args.project.as_deref(),
        args.engine_path.as_deref(),
        args.target.as_deref(),
        &args.platform,
        &args.config,
        args.output_dir.as_deref(),
        args.dry_run,
        &args.uat_args,
    )
}
