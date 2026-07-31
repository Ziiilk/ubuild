use anyhow::Result;

use crate::cli::PackageArgs;
use crate::core::package_executor::PackageExecutor;
use crate::core::project_operation::ProjectOperation;
use crate::types::OperationKind;

pub fn execute(args: PackageArgs) -> Result<()> {
    if args.dry_run {
        return package(&args);
    }
    ProjectOperation::execute(args.project.as_deref(), OperationKind::Package, || {
        package(&args)
    })
}

fn package(args: &PackageArgs) -> Result<()> {
    PackageExecutor::run(
        args.project.as_deref(),
        args.engine_path.as_deref(),
        &args.platform,
        &args.config,
        args.output_dir.as_deref(),
        args.dry_run,
        &args.uat_args,
    )
}
