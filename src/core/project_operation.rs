use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(windows)]
use std::sync::Arc;
#[cfg(windows)]
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::types::{OperationKind, PROJECT_OPERATION_STATE_DIR};
use crate::utils::file::atomic_write;
use crate::utils::logger::Logger;

use super::project_path_resolver::ProjectPathResolver;

const REPLACED_EXIT_CODE: i32 = 72;
const OWNER_SCHEMA_VERSION: u32 = 3;
const TAKEOVER_TIMEOUT: Duration = Duration::from_secs(5);
const LOCK_RETRY_INTERVAL: Duration = Duration::from_millis(25);
#[cfg(windows)]
const REPLACEMENT_WAIT_INTERVAL: Duration = Duration::from_millis(10);

pub struct ProjectOperation;

impl ProjectOperation {
    pub fn execute<T>(
        project: Option<&str>,
        kind: OperationKind,
        operation: impl FnOnce() -> Result<T>,
    ) -> Result<T> {
        let project = Self::project_identity(project, kind)?;
        let workspace = Self::workspace_identity(&project)?;
        let state = StatePaths::new(&workspace)?;
        let coordinator = Self::open_lock(&state.coordinator)?;
        Self::lock_until(
            &coordinator,
            Instant::now() + TAKEOVER_TIMEOUT,
            "project takeover coordinator",
        )?;

        let lease = Self::open_lock(&state.lease)?;
        match lease.try_lock() {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => {
                Self::replace_owner(&workspace, &state, &lease)?;
            }
            Err(TryLockError::Error(error)) => {
                return Err(error).context("Failed to inspect active Project Operation");
            }
        }

        let replacement = ReplacementSignal::start(&state.replacement_request)?;
        let owner = OwnerRecord {
            schema_version: OWNER_SCHEMA_VERSION,
            project,
            workspace,
            operation: kind,
            pid: std::process::id(),
        };
        atomic_write(&state.owner, serde_json::to_vec_pretty(&owner)?)?;
        drop(coordinator);

        let result = operation();
        Self::finish_operation(&state, lease, replacement);
        result
    }

    fn project_identity(project: Option<&str>, kind: OperationKind) -> Result<PathBuf> {
        let resolved = if kind == OperationKind::Package {
            ProjectPathResolver::resolve_strict(project)?
        } else {
            ProjectPathResolver::resolve_or_throw(project)?
        };
        fs::canonicalize(&resolved)
            .with_context(|| format!("Failed to canonicalize project {}", resolved.display()))
    }

    fn workspace_identity(project: &Path) -> Result<PathBuf> {
        let workspace = ProjectPathResolver::project_dir(project);
        fs::canonicalize(&workspace)
            .with_context(|| format!("Failed to canonicalize workspace {}", workspace.display()))
    }

    fn finish_operation(state: &StatePaths, lease: File, replacement: ReplacementSignal) {
        let coordinator = match Self::open_lock(&state.coordinator) {
            Ok(coordinator) => coordinator,
            Err(error) => {
                Logger::debug(&format!(
                    "Failed to coordinate Project Operation cleanup: {error:#}"
                ));
                drop(lease);
                drop(replacement);
                return;
            }
        };

        match coordinator.try_lock() {
            Ok(()) => {
                if let Err(error) = fs::remove_file(&state.owner) {
                    if error.kind() != ErrorKind::NotFound {
                        Logger::debug(&format!(
                            "Failed to remove Project Operation owner record {}: {error}",
                            state.owner.display()
                        ));
                    }
                }
            }
            Err(TryLockError::WouldBlock) => {}
            Err(TryLockError::Error(error)) => {
                Logger::debug(&format!(
                    "Failed to inspect Project Operation cleanup coordinator: {error}"
                ));
            }
        }
        drop(lease);
        drop(replacement);
    }

    fn replace_owner(workspace: &Path, state: &StatePaths, lease: &File) -> Result<()> {
        let owner = fs::read(&state.owner)
            .ok()
            .and_then(|contents| serde_json::from_slice::<OwnerRecord>(&contents).ok())
            .filter(|owner| {
                owner.schema_version == OWNER_SCHEMA_VERSION && owner.workspace == workspace
            });
        if let Some(owner) = owner.as_ref() {
            Logger::warning(&format!(
                "Replacing previous ubuild {} operation (PID {})",
                owner.operation, owner.pid
            ));
        } else {
            Logger::warning("Replacing previous Project Operation");
        }

        let deadline = Instant::now() + TAKEOVER_TIMEOUT;
        ReplacementSignal::request(&state.replacement_request)?;
        Self::lock_until(lease, deadline, "previous Project Operation")
    }

    fn open_lock(path: &Path) -> Result<File> {
        OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path)
            .with_context(|| format!("Failed to open Project Operation lock {}", path.display()))
    }

    fn lock_until(file: &File, deadline: Instant, description: &str) -> Result<()> {
        loop {
            match file.try_lock() {
                Ok(()) => return Ok(()),
                Err(TryLockError::WouldBlock) => {
                    if Instant::now() >= deadline {
                        anyhow::bail!(
                            "Timed out after {:.1}s waiting for {description}",
                            TAKEOVER_TIMEOUT.as_secs_f64()
                        );
                    }
                    std::thread::sleep(LOCK_RETRY_INTERVAL);
                }
                Err(TryLockError::Error(error)) => {
                    return Err(error).with_context(|| format!("Failed to lock {description}"));
                }
            }
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
struct OwnerRecord {
    schema_version: u32,
    project: PathBuf,
    workspace: PathBuf,
    operation: OperationKind,
    pid: u32,
}

struct StatePaths {
    coordinator: PathBuf,
    lease: PathBuf,
    owner: PathBuf,
    replacement_request: PathBuf,
}

impl StatePaths {
    fn new(workspace: &Path) -> Result<Self> {
        let workspace_key = workspace_key(workspace);
        let state_dir = workspace
            .join("Saved")
            .join(PROJECT_OPERATION_STATE_DIR)
            .join(&workspace_key);
        fs::create_dir_all(&state_dir).with_context(|| {
            format!(
                "Failed to create Project Operation state directory {}",
                state_dir.display()
            )
        })?;
        Ok(Self {
            coordinator: state_dir.join("takeover.lock"),
            lease: state_dir.join("operation.lock"),
            owner: state_dir.join("owner.json"),
            replacement_request: state_dir.join("replacement.request"),
        })
    }
}

fn workspace_key(workspace: &Path) -> String {
    let mut hasher = Sha256::new();

    #[cfg(windows)]
    {
        let normalized = workspace
            .to_string_lossy()
            .replace('/', "\\")
            .to_lowercase();
        hasher.update(normalized.as_bytes());
    }
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        hasher.update(workspace.as_os_str().as_bytes());
    }
    #[cfg(not(any(windows, unix)))]
    {
        hasher.update(workspace.to_string_lossy().as_bytes());
    }

    format!("{:x}", hasher.finalize())
}

#[cfg(windows)]
struct ReplacementSignal {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

#[cfg(windows)]
impl ReplacementSignal {
    fn start(request_path: &Path) -> Result<Self> {
        let token = replacement_token()?;
        atomic_write(request_path, token)?;

        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);
        let request_path = request_path.to_path_buf();
        let thread = std::thread::spawn(move || {
            while !thread_stop.load(Ordering::Acquire) {
                if fs::read(&request_path).is_ok_and(|contents| contents != token) {
                    std::process::exit(REPLACED_EXIT_CODE);
                }
                std::thread::sleep(REPLACEMENT_WAIT_INTERVAL);
            }
        });

        Ok(Self {
            stop,
            thread: Some(thread),
        })
    }

    fn request(request_path: &Path) -> Result<()> {
        atomic_write(request_path, replacement_token()?)
    }
}

#[cfg(windows)]
impl Drop for ReplacementSignal {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            if thread.join().is_err() {
                Logger::debug("Project Operation replacement listener panicked");
            }
        }
    }
}

#[cfg(not(windows))]
struct ReplacementSignal;

#[cfg(not(windows))]
impl ReplacementSignal {
    fn start(_request_path: &Path) -> Result<Self> {
        Ok(Self)
    }

    fn request(_request_path: &Path) -> Result<()> {
        Ok(())
    }
}

#[cfg(windows)]
fn replacement_token() -> Result<[u8; 16]> {
    let mut token = [0_u8; 16];
    getrandom::fill(&mut token)
        .map_err(|error| anyhow::anyhow!("Failed to create replacement token: {error}"))?;
    Ok(token)
}

#[cfg(test)]
mod tests {
    use std::fs;
    #[cfg(windows)]
    use std::path::Path;
    #[cfg(windows)]
    use std::process::{Child, Command};
    #[cfg(windows)]
    use std::time::{Duration, Instant};

    use anyhow::Result;
    use tempfile::tempdir;

    use crate::types::OperationKind;

    #[cfg(windows)]
    use super::REPLACED_EXIT_CODE;
    use super::{ProjectOperation, ReplacementSignal, StatePaths};

    #[test]
    fn canonical_paths_share_project_identity() -> Result<()> {
        let directory = tempdir()?;
        let project = directory.path().join("Game.uproject");
        fs::write(&project, "{}")?;
        let relative = directory.path().join(".").join("Game.uproject");

        let direct = ProjectOperation::project_identity(
            Some(&project.to_string_lossy()),
            OperationKind::Build,
        )?;
        let normalized = ProjectOperation::project_identity(
            Some(&relative.to_string_lossy()),
            OperationKind::Build,
        )?;

        assert_eq!(direct, normalized);
        Ok(())
    }

    #[test]
    fn project_resolution_preserves_command_compatibility() -> Result<()> {
        let directory = tempdir()?;
        fs::write(directory.path().join("First.uproject"), "{}")?;
        fs::write(directory.path().join("Second.uproject"), "{}")?;
        let project_dir = directory.path().to_string_lossy();

        let build = ProjectOperation::project_identity(Some(&project_dir), OperationKind::Build)?;
        let package =
            ProjectOperation::project_identity(Some(&project_dir), OperationKind::Package);

        assert_eq!(
            build.extension().and_then(std::ffi::OsStr::to_str),
            Some("uproject")
        );
        assert!(package.is_err());
        Ok(())
    }

    #[test]
    fn operation_owns_project_for_entire_closure() -> Result<()> {
        let directory = tempdir()?;
        let project = directory.path().join("Game.uproject");
        fs::write(&project, "{}")?;
        let workspace = fs::canonicalize(directory.path())?;
        let state = StatePaths::new(&workspace)?;

        ProjectOperation::execute(
            Some(&project.to_string_lossy()),
            OperationKind::Build,
            || {
                assert!(state.owner.is_file());
                Ok(())
            },
        )?;

        assert!(!state.owner.exists());
        let lease = ProjectOperation::open_lock(&state.lease)?;
        assert!(lease.try_lock().is_ok());
        Ok(())
    }

    #[test]
    fn projects_in_same_workspace_share_operation_state() -> Result<()> {
        let directory = tempdir()?;
        let first = directory.path().join("First.uproject");
        let second = directory.path().join("Second.uproject");
        fs::write(&first, "{}")?;
        fs::write(&second, "{}")?;

        let first_workspace = ProjectOperation::workspace_identity(&fs::canonicalize(first)?)?;
        let second_workspace = ProjectOperation::workspace_identity(&fs::canonicalize(second)?)?;
        let first_state = StatePaths::new(&first_workspace)?;
        let second_state = StatePaths::new(&second_workspace)?;

        assert_eq!(first_workspace, second_workspace);
        assert_eq!(first_state.lease, second_state.lease);
        assert_eq!(
            first_state.replacement_request,
            second_state.replacement_request
        );
        Ok(())
    }

    #[test]
    fn cleanup_does_not_delete_owner_during_takeover() -> Result<()> {
        let directory = tempdir()?;
        let project = directory.path().join("Game.uproject");
        fs::write(&project, "{}")?;
        let workspace = fs::canonicalize(directory.path())?;
        let state = StatePaths::new(&workspace)?;
        fs::write(&state.owner, "{}")?;

        let lease = ProjectOperation::open_lock(&state.lease)?;
        lease.lock()?;
        let replacement = ReplacementSignal::start(&state.replacement_request)?;
        let coordinator = ProjectOperation::open_lock(&state.coordinator)?;
        coordinator.lock()?;

        ProjectOperation::finish_operation(&state, lease, replacement);

        assert!(state.owner.is_file());
        let replacement_lease = ProjectOperation::open_lock(&state.lease)?;
        assert!(replacement_lease.try_lock().is_ok());
        Ok(())
    }

    #[cfg(windows)]
    #[test]
    fn newer_workspace_operation_terminates_previous_ubuild_process() -> Result<()> {
        let directory = tempdir()?;
        let first = directory.path().join("First.uproject");
        let second = directory.path().join("Second.uproject");
        let ready = directory.path().join("ready");
        fs::write(&first, "{}")?;
        fs::write(&second, "{}")?;

        let mut child = Command::new(std::env::current_exe()?)
            .args([
                "--exact",
                "core::project_operation::tests::operation_helper",
                "--nocapture",
            ])
            .env("UBUILD_OPERATION_HELPER_PROJECT", &first)
            .env("UBUILD_OPERATION_HELPER_READY", &ready)
            .spawn()?;
        wait_for_file(&mut child, &ready)?;

        let takeover = ProjectOperation::execute(
            Some(&second.to_string_lossy()),
            OperationKind::Build,
            || Ok(()),
        );
        if takeover.is_err() {
            let _ = child.kill();
        }
        takeover?;

        let status = child.wait()?;
        assert_eq!(status.code(), Some(REPLACED_EXIT_CODE));
        Ok(())
    }

    #[cfg(windows)]
    #[test]
    fn forged_owner_cannot_redirect_replacement() -> Result<()> {
        let directory = tempdir()?;
        let first_workspace = directory.path().join("First");
        let second_workspace = directory.path().join("Second");
        fs::create_dir_all(&first_workspace)?;
        fs::create_dir_all(&second_workspace)?;
        let first = first_workspace.join("Game.uproject");
        let second = second_workspace.join("Game.uproject");
        let first_ready = directory.path().join("first-ready");
        let second_ready = directory.path().join("second-ready");
        fs::write(&first, "{}")?;
        fs::write(&second, "{}")?;

        let mut first_child = spawn_operation_helper(&first, &first_ready)?;
        let mut second_child = spawn_operation_helper(&second, &second_ready)?;
        wait_for_file(&mut first_child, &first_ready)?;
        wait_for_file(&mut second_child, &second_ready)?;

        let first_state = StatePaths::new(&fs::canonicalize(&first_workspace)?)?;
        let second_state = StatePaths::new(&fs::canonicalize(&second_workspace)?)?;
        fs::copy(&second_state.owner, &first_state.owner)?;

        let takeover =
            ProjectOperation::execute(Some(&first.to_string_lossy()), OperationKind::Build, || {
                Ok(())
            });
        if takeover.is_err() {
            let _ = first_child.kill();
        }
        takeover?;

        let first_status = first_child.wait()?;
        let second_is_running = second_child.try_wait()?.is_none();
        let _ = second_child.kill();
        let _ = second_child.wait();

        assert_eq!(first_status.code(), Some(REPLACED_EXIT_CODE));
        assert!(second_is_running);
        Ok(())
    }

    #[cfg(windows)]
    #[test]
    fn operation_helper() -> Result<()> {
        let Some(project) = std::env::var_os("UBUILD_OPERATION_HELPER_PROJECT") else {
            return Ok(());
        };
        let ready = std::env::var_os("UBUILD_OPERATION_HELPER_READY")
            .ok_or_else(|| anyhow::anyhow!("Missing helper ready path"))?;

        ProjectOperation::execute(
            Some(&std::path::PathBuf::from(project).to_string_lossy()),
            OperationKind::Run,
            || {
                fs::write(ready, "ready")?;
                std::thread::sleep(Duration::from_secs(60));
                Ok(())
            },
        )
    }

    #[cfg(windows)]
    fn wait_for_file(child: &mut Child, path: &std::path::Path) -> Result<()> {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if path.is_file() {
                return Ok(());
            }
            if let Some(status) = child.try_wait()? {
                anyhow::bail!("Project Operation helper exited early with {status}");
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                anyhow::bail!("Timed out waiting for Project Operation helper");
            }
            std::thread::sleep(Duration::from_millis(25));
        }
    }

    #[cfg(windows)]
    fn spawn_operation_helper(project: &Path, ready: &Path) -> Result<Child> {
        Ok(Command::new(std::env::current_exe()?)
            .args([
                "--exact",
                "core::project_operation::tests::operation_helper",
                "--nocapture",
            ])
            .env("UBUILD_OPERATION_HELPER_PROJECT", project)
            .env("UBUILD_OPERATION_HELPER_READY", ready)
            .spawn()?)
    }
}
