use anyhow::Result;

use crate::cli::RunArgs;
use crate::core::project_operation::ProjectOperation;
use crate::core::project_runner::ProjectRunner;
use crate::types::OperationKind;

pub fn execute(args: RunArgs) -> Result<()> {
    if args.dry_run {
        return run(&args);
    }
    ProjectOperation::execute(args.project.as_deref(), OperationKind::Run, || run(&args))
}

fn run(args: &RunArgs) -> Result<()> {
    ProjectRunner::run(
        &args.config,
        &args.platform,
        args.project.as_deref(),
        args.engine_path.as_deref(),
        args.dry_run,
        args.build_first,
        args.no_build,
        &args.args,
    )
}
