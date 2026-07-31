use anyhow::Result;

use crate::cli::SwitchArgs;
use crate::core::project_operation::ProjectOperation;
use crate::core::switch_executor::SwitchExecutor;
use crate::types::OperationKind;
use crate::utils::logger::Logger;

pub fn execute(args: SwitchArgs) -> Result<()> {
    ProjectOperation::execute(args.project.as_deref(), OperationKind::Switch, || {
        switch(&args)
    })
}

fn switch(args: &SwitchArgs) -> Result<()> {
    Logger::title("Switch Engine");

    SwitchExecutor::execute(args.project.as_deref(), args.engine_path.as_deref())?;

    Ok(())
}
