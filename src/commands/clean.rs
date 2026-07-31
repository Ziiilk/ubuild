use anyhow::Result;

use crate::cli::CleanArgs;
use crate::core::clean_executor::CleanExecutor;
use crate::core::project_operation::ProjectOperation;
use crate::types::OperationKind;

pub fn execute(args: CleanArgs) -> Result<()> {
    if args.dry_run {
        return clean(&args);
    }
    ProjectOperation::execute(args.project.as_deref(), OperationKind::Clean, || {
        clean(&args)
    })
}

fn clean(args: &CleanArgs) -> Result<()> {
    let result = CleanExecutor::execute(
        args.project.as_deref(),
        args.engine_path.as_deref(),
        args.dry_run,
        args.binaries_only,
    )?;

    if !result.success() {
        anyhow::bail!("Failed to clean {} path(s)", result.failed_paths.len());
    }

    Ok(())
}
