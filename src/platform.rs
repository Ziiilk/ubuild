use std::path::{Path, PathBuf};
use std::process::Child;

use anyhow::{Context, Result};

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;

#[cfg(windows)]
pub struct ChildLifetimeGuard {
    _job: win32job::Job,
}

#[cfg(not(windows))]
pub struct ChildLifetimeGuard;

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

#[cfg(windows)]
pub fn bind_child_lifetime(child: &Child) -> Result<ChildLifetimeGuard> {
    let mut limits = win32job::ExtendedLimitInfo::new();
    limits.limit_kill_on_job_close();

    let job = win32job::Job::create_with_limit_info(&limits)
        .context("Failed to create Windows Job Object")?;
    job.assign_process(child.as_raw_handle() as isize)
        .context("Failed to assign process to Windows Job Object")?;

    Ok(ChildLifetimeGuard { _job: job })
}

#[cfg(not(windows))]
pub fn bind_child_lifetime(_child: &Child) -> Result<ChildLifetimeGuard> {
    Ok(ChildLifetimeGuard)
}

#[cfg(all(test, windows))]
mod tests {
    use std::process::Command;

    use anyhow::{Context, Result};

    use super::bind_child_lifetime;

    #[test]
    fn dropping_lifetime_guard_terminates_child() -> Result<()> {
        let mut child = Command::new("ping")
            .args(["-t", "127.0.0.1"])
            .spawn()
            .context("Failed to start test process")?;
        let guard = bind_child_lifetime(&child)?;
        assert!(child.try_wait()?.is_none());

        drop(guard);
        child
            .wait()
            .context("Failed to wait for terminated test process")?;
        Ok(())
    }
}
