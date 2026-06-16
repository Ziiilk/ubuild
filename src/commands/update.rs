use anyhow::{Context, Result};

use crate::types::{REPO_NAME, REPO_OWNER};
use crate::utils::logger::Logger;

pub fn execute() -> Result<()> {
    Logger::title("Update ubuild");

    let current = env!("CARGO_PKG_VERSION");
    Logger::info(&format!("Current version: {current}"));
    Logger::info("Checking for updates from GitHub releases...");

    let status = self_update::backends::github::Update::configure()
        .repo_owner(REPO_OWNER)
        .repo_name(REPO_NAME)
        .bin_name(REPO_NAME)
        .current_version(current)
        .show_download_progress(true)
        .build()
        .context("Failed to configure updater")?
        .update()
        .context("Failed to update ubuild")?;

    Logger::divider();
    if status.updated() {
        Logger::success(&format!("Updated to version {}", status.version()));
    } else {
        Logger::success("Already running the latest version");
    }

    Ok(())
}
