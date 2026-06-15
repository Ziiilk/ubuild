use std::path::{Path, PathBuf};

pub fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

pub fn exe_extension() -> &'static str {
    if is_windows() { ".exe" } else { "" }
}

pub fn bat_extension() -> &'static str {
    if is_windows() { ".bat" } else { ".sh" }
}

pub fn normalize_path(p: &Path) -> PathBuf {
    if is_windows() {
        PathBuf::from(p.to_string_lossy().replace('/', "\\"))
    } else {
        PathBuf::from(p.to_string_lossy().replace('\\', "/"))
    }
}
