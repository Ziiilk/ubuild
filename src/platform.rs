use std::path::{Path, PathBuf};
use std::process::Command;

pub fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

pub fn exe_extension() -> &'static str {
    if is_windows() {
        ".exe"
    } else {
        ""
    }
}

pub fn bat_extension() -> &'static str {
    if is_windows() {
        ".bat"
    } else {
        ".sh"
    }
}

/// UE target-platform name for the current host (Win64, Mac, Linux).
pub fn host_target_platform() -> &'static str {
    if is_windows() {
        "Win64"
    } else if cfg!(target_os = "macos") {
        "Mac"
    } else {
        "Linux"
    }
}

pub fn normalize_path(p: &Path) -> PathBuf {
    if is_windows() {
        PathBuf::from(p.to_string_lossy().replace('/', "\\"))
    } else {
        PathBuf::from(p.to_string_lossy().replace('\\', "/"))
    }
}

/// Terminate a process (and its child tree, on Windows) by PID.
pub fn kill_process(pid: u32) {
    let pid = pid.to_string();
    let _ = if is_windows() {
        Command::new("taskkill")
            .args(["/PID", &pid, "/T", "/F"])
            .output()
    } else {
        Command::new("kill").args(["-TERM", &pid]).output()
    };
}
