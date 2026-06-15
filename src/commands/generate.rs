use anyhow::Result;

use crate::cli::GenerateArgs;
use crate::core::project_generator::ProjectGenerator;
use crate::types::IDE_TYPES;
use crate::utils::logger::Logger;

pub fn execute(args: GenerateArgs) -> Result<()> {
    Logger::title("Generate Project Files");

    if args.list_ides {
        ProjectGenerator::list_ides();
        return Ok(());
    }

    if !IDE_TYPES.contains(&args.ide.as_str()) {
        anyhow::bail!(
            "Invalid IDE type: {}. Valid options: {}",
            args.ide,
            IDE_TYPES.join(", ")
        );
    }

    let result = ProjectGenerator::generate(
        &args.ide,
        args.project.as_deref(),
        args.engine_path.as_deref(),
        args.force,
    )?;

    Logger::success("Project files generated successfully");
    if !result.generated_files.is_empty() {
        Logger::subtitle("Generated Files");
        for f in &result.generated_files {
            Logger::writeln(&format!("  • {}", f.display()));
        }
    }

    Ok(())
}
