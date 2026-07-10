use anyhow::Result;

use crate::cli::InstalledArgs;
use crate::core::installed_build_executor::InstalledBuildExecutor;

pub fn execute(args: InstalledArgs) -> Result<()> {
    InstalledBuildExecutor::run(
        args.engine_path.as_deref(),
        args.output_dir.as_deref(),
        args.all_platforms,
        &args.platforms,
        &args.configs,
        args.no_ddc,
        args.clean,
        args.verbose,
        args.dry_run,
        &args.uat_args,
    )
}
