use anyhow::Result;

use crate::cli::RunArgs;
use crate::core::project_runner::ProjectRunner;

pub fn execute(args: RunArgs) -> Result<()> {
    ProjectRunner::run(
        &args.target,
        &args.config,
        &args.platform,
        args.project.as_deref(),
        args.engine_path.as_deref(),
        args.dry_run,
        args.build_first,
        args.no_build,
        args.detached,
        &args.args,
    )
}
