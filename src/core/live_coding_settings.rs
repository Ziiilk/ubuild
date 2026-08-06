use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};

use crate::types::LiveCodingSettingsResult;
use crate::utils::file::atomic_write;
use crate::utils::logger::Logger;

use super::engine_resolver::EngineResolver;

const SECTION: &str = "[/Script/LiveCoding.LiveCodingSettings]";
const KEY: &str = "bEnabled";

pub struct LiveCodingSettings;

impl LiveCodingSettings {
    pub fn set_enabled_for_installed_engines(
        enabled: bool,
    ) -> Result<Vec<LiveCodingSettingsResult>> {
        let installations = EngineResolver::find_engine_installations();
        if installations.is_empty() {
            bail!(
                "No Unreal Engine installations were found in the registry or Epic Launcher manifest"
            );
        }

        // `WindowsEditorPerProjectUserSettings.ini` is the global editor-preference
        // defaults file that every project consults at startup. A project only
        // overrides a preference once it has saved one itself, so flipping the
        // value here is the single global switch that applies to all projects.
        // This is intentionally NOT the engine-standalone config under
        // %LOCALAPPDATA%, which only applies when the editor runs without a project.
        //
        // This file lives inside the engine installation, which for a default
        // Epic Launcher install sits under Program Files and may be read-only for
        // a non-elevated user. A single unwritable engine must not abort the
        // whole batch, so per-engine write failures are reported and skipped
        // rather than propagated; the command only fails when nothing was written.
        let mut visited: HashSet<PathBuf> = HashSet::new();
        let mut results = Vec::new();
        // Per-engine failures carry only the label and path: the underlying
        // error is already logged inline and is not reused in the summary.
        let mut failures: Vec<(String, PathBuf)> = Vec::new();
        let action = if enabled { "enable" } else { "disable" };
        for engine in installations {
            let engine_dir = engine.path.join("Engine");
            if !engine_dir.exists() {
                continue;
            }

            // The resolver already dedupes installations with identical path
            // strings. Canonicalize here additionally collapses the same
            // physical install reached through case or symlink/junction aliases,
            // so each engine file is written at most once.
            let canonical = fs::canonicalize(&engine.path).unwrap_or_else(|_| engine.path.clone());
            if !visited.insert(canonical) {
                continue;
            }

            let settings_path = engine_dir
                .join("Config")
                .join("Windows")
                .join("WindowsEditorPerProjectUserSettings.ini");

            let engine_version = engine.version.map_or_else(
                || engine.path.display().to_string(),
                |version| version.major_minor(),
            );

            match Self::write_enabled(&settings_path, enabled) {
                Ok(()) => results.push(LiveCodingSettingsResult {
                    engine_version,
                    settings_path,
                }),
                Err(error) => {
                    // Common trigger: the engine install is read-only (e.g. a
                    // Launcher install under Program Files) and this process is
                    // not elevated. Surface it inline and keep going so any
                    // writable engine is still configured.
                    Logger::warning(&format!(
                        "Failed to {action} Live Coding for Unreal Engine {engine_version}: {error}"
                    ));
                    failures.push((engine_version, settings_path));
                }
            }
        }

        if results.is_empty() {
            if failures.is_empty() {
                bail!("No Unreal Engine installations with a valid Engine directory were found");
            }

            // Every candidate failed to write. The most common reason is a
            // read-only engine install, so name it explicitly.
            let detail = failures
                .into_iter()
                .map(|(engine_version, settings_path)| {
                    format!("  {engine_version}: {}", settings_path.display())
                })
                .collect::<Vec<_>>()
                .join("\n");
            bail!(
                "Could not {action} Live Coding for any engine. The engine \
                 install is likely read-only (e.g. a Launcher install under \
                 Program Files); rerun as administrator.\n{detail}"
            );
        }

        Ok(results)
    }

    fn write_enabled(settings_path: &Path, enabled: bool) -> Result<()> {
        let existing = match fs::read_to_string(settings_path) {
            Ok(content) => content,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(error) => {
                return Err(error).with_context(|| {
                    format!("Failed to read settings file {}", settings_path.display())
                });
            }
        };
        let updated = update_ini(&existing, enabled);
        if updated == existing {
            return Ok(());
        }
        let parent = settings_path
            .parent()
            .context("Live Coding settings path has no parent directory")?;
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create settings directory {}", parent.display()))?;

        atomic_write(settings_path, updated)?;
        Ok(())
    }
}

fn update_ini(content: &str, enabled: bool) -> String {
    let newline = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let value = if enabled { "True" } else { "False" };
    let mut lines: Vec<String> = content.lines().map(str::to_owned).collect();
    let section_index = lines
        .iter()
        .position(|line| line.trim().eq_ignore_ascii_case(SECTION));

    if let Some(start) = section_index {
        let end = lines[start + 1..]
            .iter()
            .position(|line| line.trim_start().starts_with('['))
            .map_or(lines.len(), |offset| start + 1 + offset);
        if let Some(key_index) = (start + 1..end).find(|index| {
            lines[*index]
                .split_once('=')
                .is_some_and(|(key, _)| key.trim().eq_ignore_ascii_case(KEY))
        }) {
            lines[key_index] = format!("{KEY}={value}");
        } else {
            lines.insert(end, format!("{KEY}={value}"));
        }
    } else {
        if !lines.is_empty() && !lines.last().is_some_and(String::is_empty) {
            lines.push(String::new());
        }
        lines.push(SECTION.to_owned());
        lines.push(format!("{KEY}={value}"));
    }

    let mut updated = lines.join(newline);
    updated.push_str(newline);
    updated
}

#[cfg(test)]
mod tests {
    use super::{update_ini, SECTION};

    #[test]
    fn adds_missing_section() {
        let updated = update_ini("[Other]\nValue=1\n", false);

        assert_eq!(
            updated,
            format!("[Other]\nValue=1\n\n{SECTION}\nbEnabled=False\n")
        );
    }

    #[test]
    fn replaces_existing_value_and_preserves_following_section() {
        let input =
            "[/Script/LiveCoding.LiveCodingSettings]\r\nOther=1\r\nbEnabled=True\r\n[Next]\r\nValue=2\r\n";

        let updated = update_ini(input, false);

        assert_eq!(
            updated,
            "[/Script/LiveCoding.LiveCodingSettings]\r\nOther=1\r\nbEnabled=False\r\n[Next]\r\nValue=2\r\n"
        );
    }

    #[test]
    fn adds_key_to_existing_section() {
        let input = "[/Script/LiveCoding.LiveCodingSettings]\nOther=1\n[Next]\nValue=2\n";

        let updated = update_ini(input, true);

        assert_eq!(
            updated,
            "[/Script/LiveCoding.LiveCodingSettings]\nOther=1\nbEnabled=True\n[Next]\nValue=2\n"
        );
    }
}
