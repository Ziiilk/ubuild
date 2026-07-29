use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};

use crate::types::LiveCodingSettingsResult;
use crate::utils::file::atomic_write;

use super::engine_resolver::EngineResolver;

const SECTION: &str = "[/Script/LiveCoding.LiveCodingSettings]";
const KEY: &str = "bEnabled";

pub struct LiveCodingSettings;

impl LiveCodingSettings {
    pub fn set_enabled_for_installed_engines(
        enabled: bool,
    ) -> Result<Vec<LiveCodingSettingsResult>> {
        let engine_versions = EngineResolver::find_engine_installations()
            .into_iter()
            .filter_map(|engine| engine.version.map(|version| version.major_minor()))
            .collect::<BTreeSet<_>>();
        if engine_versions.is_empty() {
            bail!(
                "No Unreal Engine installations with detectable versions were found in the registry or Epic Launcher manifest"
            );
        }

        let local_app_data = env::var_os("LOCALAPPDATA").map(PathBuf::from).context(
            "LOCALAPPDATA is not set; user-level Unreal Engine settings are unavailable",
        )?;
        engine_versions
            .into_iter()
            .map(|engine_version| {
                let settings_path = local_app_data
                    .join("UnrealEngine")
                    .join(&engine_version)
                    .join("Saved")
                    .join("Config")
                    .join("WindowsEditor")
                    .join("EditorPerProjectUserSettings.ini");
                Self::write_enabled(&settings_path, enabled)?;
                Ok(LiveCodingSettingsResult {
                    engine_version,
                    settings_path,
                })
            })
            .collect()
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
