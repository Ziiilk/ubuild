use anyhow::Result;

use crate::cli::CleanArgs;
use crate::core::clean_executor::CleanExecutor;

pub fn execute(args: CleanArgs) -> Result<()> {
    let result = CleanExecutor::execute(
        args.project.as_deref(),
        args.engine_path.as_deref(),
        args.dry_run,
        args.binaries_only,
    )?;

    if !result.success() {
        anyhow::bail!(
            "Failed to clean {} path(s)",
            result.failed_paths.len()
        );
    }

    Ok(())
}
