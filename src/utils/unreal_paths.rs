use std::path::{Path, PathBuf};

use crate::error::UbuildError;
use crate::platform;

/// UBT relative paths, checked in order (UE5.3+ first, then older).
const UBT_RELATIVE_PATHS: &[&str] = &[
    "Engine/Binaries/DotNET/UnrealBuildTool",
    "Engine/Binaries/DotNET",
];

const UBT_BINARY_NAME: &str = "UnrealBuildTool";

pub fn resolve_ubt_path(engine_path: &Path) -> Result<PathBuf, UbuildError> {
    let exe_name = format!("{UBT_BINARY_NAME}{}", platform::exe_extension());
    let mut tried = Vec::new();

    for relative in UBT_RELATIVE_PATHS {
        let candidate = engine_path.join(relative).join(&exe_name);
        if candidate.exists() {
            return Ok(candidate);
        }
        tried.push(candidate);
    }

    Err(UbuildError::UbtNotFound { paths: tried })
}

pub fn resolve_build_bat_path(engine_path: &Path) -> Option<PathBuf> {
    let bat = engine_path
        .join("Engine")
        .join("Build")
        .join("BatchFiles")
        .join(format!("Build{}", platform::bat_extension()));
    bat.exists().then_some(bat)
}

pub fn resolve_engine_version_path(engine_path: &Path) -> Option<PathBuf> {
    let primary = engine_path
        .join("Engine")
        .join("Build")
        .join("Build.version");
    if primary.exists() {
        return Some(primary);
    }

    let alt = engine_path
        .join("Engine")
        .join("Binaries")
        .join("Win64")
        .join("UnrealEditor.version");
    alt.exists().then_some(alt)
}
