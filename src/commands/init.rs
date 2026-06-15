use anyhow::Result;

use crate::cli::InitArgs;
use crate::core::project_initializer::ProjectInitializer;
use crate::utils::logger::Logger;

pub fn execute(args: InitArgs) -> Result<()> {
    Logger::title("Initialize Unreal Engine Project");

    let result = ProjectInitializer::initialize(
        &args.name,
        &args.project_type,
        &args.template,
        args.directory.as_deref(),
        args.engine_path.as_deref(),
        args.force,
    )?;

    Logger::subtitle("Created Files");
    for f in &result.created_files {
        Logger::writeln(&format!("  • {}", f.display()));
    }

    println!();
    Logger::subtitle("Next Steps");
    if args.project_type == "cpp" {
        Logger::writeln(&format!(
            "  1. Generate project files: ubuild generate --project \"{}\"",
            result.project_path.display()
        ));
        Logger::writeln(&format!(
            "  2. Build the project: ubuild build --project \"{}\"",
            result.project_path.display()
        ));
        Logger::writeln(&format!(
            "  3. Open in editor: Double-click {}.uproject",
            args.name
        ));
    } else {
        Logger::writeln(&format!(
            "  1. Open in editor: Double-click {}.uproject",
            args.name
        ));
        Logger::writeln("  2. Start creating Blueprints in Content directory");
    }

    Ok(())
}
