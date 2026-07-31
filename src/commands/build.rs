use anyhow::Result;

use crate::cli::BuildArgs;
use crate::core::project_builder::ProjectBuilder;
use crate::core::project_operation::ProjectOperation;
use crate::types::OperationKind;

pub fn execute(args: BuildArgs) -> Result<()> {
    if args.dry_run {
        return build(&args);
    }
    ProjectOperation::execute(args.project.as_deref(), OperationKind::Build, || {
        build(&args)
    })
}

fn build(args: &BuildArgs) -> Result<()> {
    ProjectBuilder::build(
        &args.config,
        &args.platform,
        args.project.as_deref(),
        args.engine_path.as_deref(),
        args.clean,
        args.verbose,
        args.dry_run,
        &args.ubt_args,
    )
}
