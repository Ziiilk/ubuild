use anyhow::Result;

use crate::cli::{LiveCodingAction, LiveCodingArgs};
use crate::core::live_coding_settings::LiveCodingSettings;
use crate::utils::logger::Logger;

pub fn execute(args: LiveCodingArgs) -> Result<()> {
    Logger::title("Live Coding");

    let enabled = matches!(args.action, LiveCodingAction::Enable);
    let results = LiveCodingSettings::set_enabled_for_installed_engines(enabled)?;
    let state = if enabled { "enabled" } else { "disabled" };

    for result in &results {
        Logger::success(&format!(
            "Live Coding {state} for Unreal Engine {}",
            result.engine_version
        ));
        Logger::info(&format!("Settings: {}", result.settings_path.display()));
    }

    Ok(())
}
