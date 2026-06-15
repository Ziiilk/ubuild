use anyhow::Result;

use crate::cli::SwitchArgs;
use crate::core::switch_executor::SwitchExecutor;
use crate::utils::logger::Logger;

pub fn execute(args: SwitchArgs) -> Result<()> {
    Logger::title("Switch Engine");

    SwitchExecutor::execute(args.project.as_deref(), args.engine_path.as_deref())?;

    Ok(())
}
