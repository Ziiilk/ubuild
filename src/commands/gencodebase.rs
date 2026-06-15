use anyhow::Result;

use crate::cli::GencodebaseArgs;
use crate::core::compile_commands_generator::CompileCommandsGenerator;
use crate::utils::logger::Logger;

pub fn execute(args: GencodebaseArgs) -> Result<()> {
    Logger::title("Generate Compile Commands Database");

    let output_path = CompileCommandsGenerator::generate(
        &args.target,
        &args.config,
        &args.platform,
        args.project.as_deref(),
        args.engine_path.as_deref(),
        !args.no_plugin_sources,
        !args.no_engine_sources,
        !args.no_engine_includes,
    )?;

    Logger::success(&format!("Compile commands generated: {}", output_path.display()));
    Logger::success("VSCode settings updated: .vscode/settings.json");

    Ok(())
}
