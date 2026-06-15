use anyhow::Result;

use crate::utils::logger::Logger;

#[allow(clippy::unnecessary_wraps)]
pub fn execute() -> Result<()> {
    Logger::title("Update ubuild");

    let current = env!("CARGO_PKG_VERSION");
    Logger::info(&format!("Current version: {current}"));

    Logger::info("To update ubuild, download the latest release from:");
    Logger::writeln("  https://github.com/Ziiilk/ubuild/releases");
    Logger::writeln("");
    Logger::info("Or if installed via cargo:");
    Logger::writeln("  cargo install ubuild --force");

    Ok(())
}
