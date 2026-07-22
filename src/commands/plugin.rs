use anyhow::Result;

use crate::cli::PluginArgs;
use crate::core::plugin_builder::PluginBuilder;

pub fn execute(args: PluginArgs) -> Result<()> {
    PluginBuilder::run(
        args.plugin.as_deref(),
        args.output.as_deref(),
        args.engine_path.as_deref(),
        &args.platforms,
        args.dry_run,
        &args.uat_args,
    )
}
