use anyhow::Result;

use crate::cli::VersionArgs;
use crate::utils::logger::Logger;

pub fn execute(args: VersionArgs) -> Result<()> {
    let version = env!("CARGO_PKG_VERSION");
    let description = env!("CARGO_PKG_DESCRIPTION");

    if args.json {
        let json = serde_json::json!({
            "name": "ubuild",
            "version": version,
            "description": description,
        });
        println!("{}", serde_json::to_string_pretty(&json)?);
        return Ok(());
    }

    Logger::title("ubuild - Unreal Engine Project Management");
    Logger::info(&format!("Version: {version}"));
    Logger::info("Package: ubuild");
    println!();
    Logger::writeln(&format!("  {description}"));
    println!();
    Logger::success("Version information retrieved successfully");

    Ok(())
}
