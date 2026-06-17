use std::process::Command;

use anyhow::{Context, Result};

use crate::types::{REPO_NAME, REPO_OWNER};
use crate::utils::logger::Logger;

pub fn execute() -> Result<()> {
    Logger::title("Update ubuild");

    let current = env!("CARGO_PKG_VERSION");
    Logger::info(&format!("Current version: {current}"));
    Logger::info("Checking for updates from GitHub releases...");

    // Default to anonymous requests to stay close to native behavior. The
    // anonymous GitHub API limit is 60/h per IP; only when that is exhausted
    // do we fall back to the user's logged-in gh CLI credentials (5000/h).
    let status = match run_update(current, None) {
        Ok(status) => status,
        Err(err) if is_rate_limited(&err) => {
            let token = gh_auth_token().context(
                "GitHub anonymous rate limit reached and no gh CLI token is available; \
                 run `gh auth login` or try again later",
            )?;
            Logger::warning("GitHub anonymous rate limit reached; retrying with gh CLI credentials");
            run_update(current, Some(&token)).context("Failed to update ubuild")?
        }
        Err(err) => return Err(err).context("Failed to update ubuild"),
    };

    Logger::divider();
    if status.updated() {
        Logger::success(&format!("Updated to version {}", status.version()));
    } else {
        Logger::success("Already running the latest version");
    }

    Ok(())
}

fn run_update(
    current: &str,
    token: Option<&str>,
) -> Result<self_update::Status, self_update::errors::Error> {
    let mut builder = self_update::backends::github::Update::configure();
    builder
        .repo_owner(REPO_OWNER)
        .repo_name(REPO_NAME)
        .bin_name(REPO_NAME)
        .current_version(current)
        .show_download_progress(true);
    if let Some(token) = token {
        builder.auth_token(token);
    }
    builder.build()?.update()
}

fn is_rate_limited(err: &self_update::errors::Error) -> bool {
    // self_update has no typed HTTP-status error, so match its message text.
    // If a self_update upgrade breaks this, the gh-token fallback stops firing.
    let msg = err.to_string();
    msg.contains("403") || msg.contains("rate limit")
}

/// Read the token from the user's logged-in gh CLI, if available.
fn gh_auth_token() -> Option<String> {
    let output = Command::new("gh").args(["auth", "token"]).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let token = String::from_utf8(output.stdout).ok()?.trim().to_string();
    if token.is_empty() {
        None
    } else {
        Some(token)
    }
}
