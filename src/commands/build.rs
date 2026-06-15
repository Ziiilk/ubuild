use anyhow::Result;

use crate::cli::BuildArgs;
use crate::core::project_builder::ProjectBuilder;

pub fn execute(args: BuildArgs) -> Result<()> {
    ProjectBuilder::build(
        &args.target,
        &args.config,
        &args.platform,
        args.project.as_deref(),
        args.engine_path.as_deref(),
        args.clean,
        args.verbose,
        args.dry_run,
        args.list_targets,
    )
}
