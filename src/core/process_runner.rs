use std::ffi::OsString;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver, SyncSender, TryRecvError};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
#[cfg(windows)]
use send_ctrlc::Interruptible;
use send_ctrlc::{InterruptibleChild, InterruptibleCommand};
#[cfg(windows)]
use tempfile::NamedTempFile;

use crate::error::UbuildError;
use crate::platform::{self, ChildLifetimeGuard};
use crate::types::{ProcessOutput, TerminationSignal};
use crate::utils::logger::Logger;

use super::log_monitor::{MonitorAction, TerminalLogMonitor};

const PROCESS_GATE_TIMEOUT: Duration = Duration::from_secs(5);
const PROCESS_GATE_RETRY_INTERVAL: Duration = Duration::from_millis(5);
const PROCESS_OUTPUT_DRAIN_TIMEOUT: Duration = Duration::from_secs(1);
const PROCESS_OUTPUT_DRAIN_RETRY_INTERVAL: Duration = Duration::from_millis(5);
const INTERRUPT_GRACE_PERIOD: Duration = Duration::from_secs(2);
const MAX_MONITOR_LINES_PER_TICK: usize = 1_024;
const MONITOR_CHANNEL_CAPACITY: usize = 2_048;

pub struct ProcessRunner;

impl ProcessRunner {
    pub fn stream(command: &mut Command) -> Result<ProcessOutput> {
        Logger::debug(&format!("Executing: {command:?}"));
        let mut managed = ManagedChild::spawn(command, OutputMode::Piped)?;
        let stdout = managed
            .child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture process stdout"))?;
        let stderr = managed
            .child
            .stderr
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture process stderr"))?;

        let (stdout, stderr) = std::thread::scope(|scope| {
            let stdout_handle = scope.spawn(|| Self::read_stream(stdout, false));
            let stderr_handle = scope.spawn(|| Self::read_stream(stderr, true));
            let stdout = stdout_handle
                .join()
                .map_err(|_| anyhow::anyhow!("stdout reader thread panicked"))??;
            let stderr = stderr_handle
                .join()
                .map_err(|_| anyhow::anyhow!("stderr reader thread panicked"))??;
            Ok::<_, anyhow::Error>((stdout, stderr))
        })?;

        let status = managed
            .child
            .wait()
            .context("Failed to wait for managed process")?;

        Ok(ProcessOutput {
            stdout,
            stderr,
            exit_code: status.code().unwrap_or(-1),
        })
    }

    pub fn capture(command: &mut Command) -> Result<ProcessOutput> {
        Logger::debug(&format!("Executing: {command:?}"));
        let managed = ManagedChild::spawn(command, OutputMode::Piped)?;
        let output = managed
            .child
            .wait_with_output()
            .context("Failed to wait for managed process")?;

        Ok(ProcessOutput {
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            exit_code: output.status.code().unwrap_or(-1),
        })
    }

    pub fn forward(command: &mut Command) -> Result<i32> {
        Logger::debug(&format!("Executing: {command:?}"));
        let mut managed = ManagedChild::spawn(command, OutputMode::Piped)?;
        let stdout = managed
            .child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture process stdout"))?;
        let stderr = managed
            .child
            .stderr
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture process stderr"))?;

        let stdout_handle = std::thread::spawn(move || Self::forward_stream(stdout, false));
        let stderr_handle = std::thread::spawn(move || Self::forward_stream(stderr, true));
        let status = managed
            .child
            .wait()
            .context("Failed to wait for managed process");
        drop(managed.lifetime);
        Self::finish_forwarders(stdout_handle, stderr_handle)?;

        let status = status?;
        Ok(status.code().unwrap_or(-1))
    }

    pub fn forward_collapsible(command: &mut Command, title: &str) -> Result<i32> {
        if !TerminalLogMonitor::is_supported() {
            return Self::forward(command);
        }

        Logger::debug(&format!("Executing: {command:?}"));
        let monitor = match TerminalLogMonitor::start(title) {
            Ok(monitor) => monitor,
            Err(error) => {
                Logger::warning(&format!(
                    "Could not start collapsible log monitor: {error:#}"
                ));
                return Self::forward(command);
            }
        };
        let outcome = Self::run_monitored(command, monitor)?;
        if let Some(signal) = outcome.termination {
            return Err(UbuildError::Terminated(signal).into());
        }
        Ok(outcome.exit_code)
    }

    /// Run a process inside a collapsible log region while capturing its
    /// stdout/stderr. Non-interactive terminals fall back to streaming output
    /// line-by-line (with capture), so callers can still inspect failures.
    pub fn forward_collapsible_capture(
        command: &mut Command,
        title: &str,
    ) -> Result<CollapsibleOutput> {
        if !TerminalLogMonitor::is_supported() {
            return Self::stream_uncaptured(command);
        }

        Logger::debug(&format!("Executing: {command:?}"));
        let monitor = match TerminalLogMonitor::start(title) {
            Ok(monitor) => monitor,
            Err(error) => {
                Logger::warning(&format!(
                    "Could not start collapsible log monitor: {error:#}"
                ));
                return Self::stream_uncaptured(command);
            }
        };
        let outcome = Self::run_monitored(command, monitor)?;
        if let Some(signal) = outcome.termination {
            return Err(UbuildError::Terminated(signal).into());
        }
        Ok(CollapsibleOutput {
            exit_code: outcome.exit_code,
            rendered_collapsible: true,
            log_locked: outcome.log_locked,
        })
    }

    /// Stream a process line-by-line to the terminal (non-collapsible fallback)
    /// and return its exit code plus whether the output showed the global-log
    /// lock markers. Full output is not retained: only the markers are tracked.
    fn stream_uncaptured(command: &mut Command) -> Result<CollapsibleOutput> {
        let output = Self::stream(command)?;
        Ok(CollapsibleOutput {
            exit_code: output.exit_code,
            rendered_collapsible: false,
            log_locked: log_locked_markers(&output.stdout, &output.stderr),
        })
    }

    fn run_monitored(
        command: &mut Command,
        mut monitor: TerminalLogMonitor,
    ) -> Result<MonitorOutcome> {
        let mut managed = ManagedInterruptibleChild::spawn(command, OutputMode::Piped)?;
        let stdout = managed
            .child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture process stdout"))?;
        let stderr = managed
            .child
            .stderr
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture process stderr"))?;
        let (sender, receiver) = mpsc::sync_channel(MONITOR_CHANNEL_CAPACITY);
        let stdout_sender = sender.clone();
        let stdout_handle =
            std::thread::spawn(move || Self::collect_stream(stdout, &stdout_sender));
        let stderr_handle = std::thread::spawn(move || Self::collect_stream(stderr, &sender));

        let mut termination = None;
        let mut interrupt_deadline = None;
        let status = loop {
            Self::drain_monitor_lines(&receiver, &mut monitor);
            if let MonitorAction::Terminate(signal) = monitor.update()? {
                if termination.is_none() {
                    termination = Some(signal);
                    if managed.child.try_wait()?.is_none() {
                        if let Err(error) = managed.signal(signal) {
                            if managed.child.try_wait()?.is_none() {
                                return Err(error)
                                    .context("Failed to signal managed process gracefully");
                            }
                        }
                        interrupt_deadline = Some(Instant::now() + INTERRUPT_GRACE_PERIOD);
                    }
                }
            }
            if let Some(status) = managed
                .child
                .try_wait()
                .context("Failed to poll managed process")?
            {
                break status;
            }
            if interrupt_deadline.is_some_and(|deadline| Instant::now() >= deadline) {
                managed
                    .force_kill()
                    .context("Failed to stop unresponsive signaled process")?;
                interrupt_deadline = None;
            }
            std::thread::sleep(TerminalLogMonitor::poll_interval());
        };

        drop(managed.lifetime.take());
        Self::drain_monitor_until_finished(
            &receiver,
            &mut monitor,
            &stdout_handle,
            &stderr_handle,
        )?;
        let exit_code = status.code().unwrap_or(-1);
        monitor.finish(exit_code, termination)?;
        let (stdout_markers, stderr_markers) =
            Self::finish_forwarders(stdout_handle, stderr_handle)?;
        let log_locked = stdout_markers.log_locked(&stderr_markers);

        Ok(MonitorOutcome {
            exit_code,
            log_locked,
            termination,
        })
    }

    pub fn inherit(command: &mut Command) -> Result<i32> {
        Logger::debug(&format!("Executing: {command:?}"));
        let mut managed = ManagedChild::spawn(command, OutputMode::Inherited)?;
        let status = managed
            .child
            .wait()
            .context("Failed to wait for managed process")?;
        Ok(status.code().unwrap_or(-1))
    }

    pub fn run_managed(
        gate_path: &Path,
        program: &Path,
        cwd: Option<&Path>,
        args: &[OsString],
    ) -> Result<i32> {
        #[cfg(windows)]
        ctrlc::set_handler(|| {}).context("Failed to install managed process control handler")?;

        Self::wait_for_gate(gate_path, PROCESS_GATE_TIMEOUT)?;

        let mut command = Command::new(program);
        command
            .args(args)
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
        if let Some(cwd) = cwd {
            command.current_dir(cwd);
        }

        let status = command
            .status()
            .with_context(|| format!("Failed to start {}", program.display()))?;
        Ok(status.code().unwrap_or(1))
    }

    fn forward_stream(stream: impl std::io::Read, is_stderr: bool) -> Result<()> {
        Self::process_stream(stream, is_stderr, |_| {})
    }

    /// Read a stream, forwarding each line to the monitor, and track whether
    /// the captured output mentions the global-log-lock failure markers. The
    /// full text is intentionally NOT accumulated (bounded memory): only the
    /// two marker substrings needed for the build retry decision are tracked.
    fn collect_stream(
        stream: impl std::io::Read,
        sender: &SyncSender<String>,
    ) -> Result<LineMarkers> {
        let mut reader = BufReader::new(stream);
        let mut bytes = Vec::new();
        let mut markers = LineMarkers::default();
        loop {
            bytes.clear();
            if reader
                .read_until(b'\n', &mut bytes)
                .context("Failed to read managed process output")?
                == 0
            {
                break;
            }

            let text = String::from_utf8_lossy(&bytes);
            let line = text.trim_end_matches(['\r', '\n']);
            if sender.send(format!("  {line}")).is_err() {
                break;
            }
            markers.observe(line);
        }
        Ok(markers)
    }

    fn drain_monitor_lines(receiver: &Receiver<String>, monitor: &mut TerminalLogMonitor) -> bool {
        Self::drain_lines(receiver, MAX_MONITOR_LINES_PER_TICK, |line| {
            monitor.push_line(line);
        })
    }

    fn drain_lines(
        receiver: &Receiver<String>,
        limit: usize,
        mut consume: impl FnMut(String),
    ) -> bool {
        for _ in 0..limit {
            match receiver.try_recv() {
                Ok(line) => consume(line),
                Err(TryRecvError::Empty | TryRecvError::Disconnected) => return true,
            }
        }
        false
    }

    fn drain_monitor_until_finished<T>(
        receiver: &Receiver<String>,
        monitor: &mut TerminalLogMonitor,
        stdout_handle: &std::thread::JoinHandle<Result<T>>,
        stderr_handle: &std::thread::JoinHandle<Result<T>>,
    ) -> Result<()> {
        let deadline = Instant::now() + PROCESS_OUTPUT_DRAIN_TIMEOUT;
        while Instant::now() < deadline {
            let queue_empty = Self::drain_monitor_lines(receiver, monitor);
            if queue_empty && stdout_handle.is_finished() && stderr_handle.is_finished() {
                break;
            }
            monitor.update()?;
            std::thread::sleep(PROCESS_OUTPUT_DRAIN_RETRY_INTERVAL);
        }
        Self::drain_monitor_lines(receiver, monitor);
        Ok(())
    }

    fn finish_forwarders<T: Default>(
        stdout_handle: std::thread::JoinHandle<Result<T>>,
        stderr_handle: std::thread::JoinHandle<Result<T>>,
    ) -> Result<(T, T)> {
        let deadline = Instant::now() + PROCESS_OUTPUT_DRAIN_TIMEOUT;
        while Instant::now() < deadline
            && (!stdout_handle.is_finished() || !stderr_handle.is_finished())
        {
            std::thread::sleep(PROCESS_OUTPUT_DRAIN_RETRY_INTERVAL);
        }

        let stdout = Self::finish_forwarder(stdout_handle, "stdout")?;
        let stderr = Self::finish_forwarder(stderr_handle, "stderr")?;
        Ok((stdout, stderr))
    }

    fn finish_forwarder<T: Default>(
        handle: std::thread::JoinHandle<Result<T>>,
        stream_name: &str,
    ) -> Result<T> {
        if handle.is_finished() {
            handle
                .join()
                .map_err(|_| anyhow::anyhow!("{stream_name} reader thread panicked"))?
        } else {
            Logger::warning(&format!(
                "{stream_name} reader did not finish within {:.1}s; output may be incomplete",
                PROCESS_OUTPUT_DRAIN_TIMEOUT.as_secs_f64()
            ));
            Ok(T::default())
        }
    }

    fn read_stream(stream: impl std::io::Read, is_stderr: bool) -> Result<String> {
        let mut buffer = String::new();
        Self::process_stream(stream, is_stderr, |text| buffer.push_str(text))?;
        Ok(buffer)
    }

    fn process_stream(
        stream: impl std::io::Read,
        is_stderr: bool,
        mut consume: impl FnMut(&str),
    ) -> Result<()> {
        let mut reader = BufReader::new(stream);
        let mut bytes = Vec::new();
        loop {
            bytes.clear();
            if reader
                .read_until(b'\n', &mut bytes)
                .context("Failed to read managed process output")?
                == 0
            {
                break;
            }

            let text = String::from_utf8_lossy(&bytes);
            let line = text.trim_end_matches(['\r', '\n']);
            if is_stderr {
                Logger::writeln_stderr(&format!("  {line}"));
            } else {
                Logger::writeln(&format!("  {line}"));
            }
            consume(&text);
        }
        Ok(())
    }

    fn wait_for_gate(gate_path: &Path, timeout: Duration) -> Result<()> {
        let deadline = Instant::now() + timeout;
        loop {
            match fs::read(gate_path) {
                Ok(contents) if contents == b"ready" => return Ok(()),
                Ok(_) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(error).with_context(|| {
                        format!("Failed to read process gate {}", gate_path.display())
                    });
                }
            }

            if Instant::now() >= deadline {
                anyhow::bail!(
                    "Managed process was not released within {:.1}s",
                    timeout.as_secs_f64()
                );
            }
            std::thread::sleep(PROCESS_GATE_RETRY_INTERVAL);
        }
    }
}

#[derive(Clone, Copy)]
enum OutputMode {
    Piped,
    Inherited,
}

struct MonitorOutcome {
    exit_code: i32,
    /// Whether the captured output showed the global UnrealBuildTool log-lock
    /// failure markers, merged across stdout and stderr.
    log_locked: bool,
    termination: Option<TerminationSignal>,
}

/// Output of a process run inside a (possibly fallback) collapsible log
/// region. `rendered_collapsible` records whether a collapsible title was
/// actually drawn (false when TTY was unsupported or the monitor failed to
/// start and output streamed line-by-line instead).
pub struct CollapsibleOutput {
    pub exit_code: i32,
    pub rendered_collapsible: bool,
    /// Whether the captured output contained the global UnrealBuildTool
    /// log-lock failure markers (used to decide the per-project-log retry).
    pub log_locked: bool,
}

/// Line-level detection of the global UnrealBuildTool log-lock failure,
/// tracked incrementally while streaming instead of accumulating full output.
#[derive(Default)]
struct LineMarkers {
    backup: bool,
    locked: bool,
}

impl LineMarkers {
    fn observe(&mut self, text: &str) {
        self.backup |= text.contains("BackupLogFile");
        self.locked |= text.contains("being used by another process");
    }

    fn log_locked(&self, other: &Self) -> bool {
        (self.backup || other.backup) && (self.locked || other.locked)
    }
}

pub(crate) fn log_locked_markers(stdout: &str, stderr: &str) -> bool {
    let mut markers = LineMarkers::default();
    markers.observe(stdout);
    markers.observe(stderr);
    markers.log_locked(&LineMarkers::default())
}

struct ManagedChild {
    child: Child,
    lifetime: ChildLifetimeGuard,
    #[cfg(windows)]
    _gate: NamedTempFile,
}

struct ManagedInterruptibleChild {
    child: InterruptibleChild,
    lifetime: Option<ChildLifetimeGuard>,
    #[cfg(windows)]
    _gate: NamedTempFile,
}

impl ManagedChild {
    #[cfg(windows)]
    fn spawn(command: &mut Command, output_mode: OutputMode) -> Result<Self> {
        let (mut helper, mut gate, program) = Self::prepare_windows_helper(command, output_mode)?;

        let mut child = helper
            .spawn()
            .with_context(|| format!("Failed to start {}", program.display()))?;
        let lifetime = match platform::bind_child_lifetime(&child) {
            Ok(lifetime) => lifetime,
            Err(bind_error) => {
                let cleanup_result = child.kill().and_then(|()| child.wait().map(|_| ()));
                if let Err(cleanup_error) = cleanup_result {
                    return Err(bind_error.context(format!(
                        "Failed to clean up process after lifecycle binding error: {cleanup_error}"
                    )));
                }
                return Err(bind_error);
            }
        };

        Self::release_windows_gate(&mut gate)?;

        Ok(Self {
            child,
            lifetime,
            _gate: gate,
        })
    }

    #[cfg(not(windows))]
    fn spawn(command: &mut Command, output_mode: OutputMode) -> Result<Self> {
        Self::configure_stdio(command, output_mode);
        let child = command.spawn().context("Failed to start managed process")?;
        let lifetime = platform::bind_child_lifetime(&child)?;
        Ok(Self { child, lifetime })
    }

    fn configure_stdio(command: &mut Command, output_mode: OutputMode) {
        command.stdin(Stdio::inherit());
        match output_mode {
            OutputMode::Piped => {
                command.stdout(Stdio::piped()).stderr(Stdio::piped());
            }
            OutputMode::Inherited => {
                command.stdout(Stdio::inherit()).stderr(Stdio::inherit());
            }
        }
    }

    #[cfg(windows)]
    fn prepare_windows_helper(
        command: &Command,
        output_mode: OutputMode,
    ) -> Result<(Command, NamedTempFile, PathBuf)> {
        let spec = ManagedProcessSpec::from_command(command);
        let gate = NamedTempFile::new().context("Failed to create managed process gate")?;
        let mut helper = Command::new(std::env::current_exe()?);
        helper
            .arg("__managed-process")
            .arg("--gate")
            .arg(gate.path())
            .arg("--program")
            .arg(&spec.program);
        if let Some(cwd) = &spec.cwd {
            helper.arg("--cwd").arg(cwd);
        }
        helper.arg("--").args(&spec.args);
        for (key, value) in &spec.environment {
            if let Some(value) = value {
                helper.env(key, value);
            } else {
                helper.env_remove(key);
            }
        }
        Self::configure_stdio(&mut helper, output_mode);
        Ok((helper, gate, spec.program))
    }

    #[cfg(windows)]
    fn release_windows_gate(gate: &mut NamedTempFile) -> Result<()> {
        gate.write_all(b"ready")
            .context("Failed to release managed process gate")?;
        gate.flush().context("Failed to flush managed process gate")
    }
}

impl Drop for ManagedInterruptibleChild {
    fn drop(&mut self) {
        if self.lifetime.is_none() {
            return;
        }
        match self.child.try_wait() {
            Ok(Some(_)) => {}
            Ok(None) | Err(_) => {
                if let Err(error) = self.force_kill() {
                    Logger::error(&format!(
                        "Failed to clean up managed process group after error: {error}"
                    ));
                }
            }
        }
    }
}

impl ManagedInterruptibleChild {
    #[cfg(windows)]
    fn spawn(command: &mut Command, output_mode: OutputMode) -> Result<Self> {
        let (mut helper, mut gate, program) =
            ManagedChild::prepare_windows_helper(command, output_mode)?;

        let mut child = helper
            .spawn_interruptible()
            .with_context(|| format!("Failed to start {}", program.display()))?;
        let lifetime = match platform::bind_child_lifetime(&child) {
            Ok(lifetime) => lifetime,
            Err(bind_error) => {
                let cleanup_result = child.kill().and_then(|()| child.wait().map(|_| ()));
                if let Err(cleanup_error) = cleanup_result {
                    return Err(bind_error.context(format!(
                        "Failed to clean up process after lifecycle binding error: {cleanup_error}"
                    )));
                }
                return Err(bind_error);
            }
        };

        ManagedChild::release_windows_gate(&mut gate)?;

        Ok(Self {
            child,
            lifetime: Some(lifetime),
            _gate: gate,
        })
    }

    #[cfg(not(windows))]
    fn spawn(command: &mut Command, output_mode: OutputMode) -> Result<Self> {
        use std::os::unix::process::CommandExt;

        ManagedChild::configure_stdio(command, output_mode);
        command.process_group(0);
        let child = command
            .spawn_interruptible()
            .context("Failed to start managed process")?;
        let lifetime = platform::bind_child_lifetime(&child)?;
        Ok(Self {
            child,
            lifetime: Some(lifetime),
        })
    }

    fn signal(&mut self, signal: TerminationSignal) -> std::io::Result<()> {
        #[cfg(windows)]
        {
            let _ = signal;
            self.child.terminate()
        }

        #[cfg(unix)]
        {
            let signal = match signal {
                TerminationSignal::Interrupt => nix::sys::signal::Signal::SIGINT,
                TerminationSignal::Terminate => nix::sys::signal::Signal::SIGTERM,
                TerminationSignal::Hangup => nix::sys::signal::Signal::SIGHUP,
            };
            signal_process_group(self.child.id(), signal)
        }

        #[cfg(not(any(unix, windows)))]
        {
            let _ = signal;
            self.child.kill()
        }
    }

    fn force_kill(&mut self) -> std::io::Result<()> {
        #[cfg(windows)]
        {
            self.child.kill()
        }

        #[cfg(unix)]
        {
            signal_process_group(self.child.id(), nix::sys::signal::Signal::SIGKILL)
        }

        #[cfg(not(any(unix, windows)))]
        {
            self.child.kill()
        }
    }
}

#[cfg(unix)]
fn signal_process_group(child_id: u32, signal: nix::sys::signal::Signal) -> std::io::Result<()> {
    let process_group = i32::try_from(child_id).map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("Process ID does not fit i32: {child_id}"),
        )
    })?;
    nix::sys::signal::killpg(nix::unistd::Pid::from_raw(process_group), signal)
        .map_err(std::io::Error::from)
}

#[cfg(windows)]
struct ManagedProcessSpec {
    program: PathBuf,
    args: Vec<OsString>,
    cwd: Option<PathBuf>,
    environment: Vec<(OsString, Option<OsString>)>,
}

#[cfg(windows)]
impl ManagedProcessSpec {
    fn from_command(command: &Command) -> Self {
        Self {
            program: PathBuf::from(command.get_program()),
            args: command.get_args().map(OsString::from).collect(),
            cwd: command.get_current_dir().map(Path::to_path_buf),
            environment: command
                .get_envs()
                .map(|(key, value)| (OsString::from(key), value.map(OsString::from)))
                .collect(),
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use std::ffi::OsString;
    use std::io::Write;
    use std::process::Command;
    use std::time::Duration;

    use anyhow::Result;
    use tempfile::NamedTempFile;

    use super::{ManagedProcessSpec, ProcessRunner};

    #[test]
    fn stream_decoding_replaces_invalid_utf8() -> Result<()> {
        let output = ProcessRunner::read_stream(&[b'A', 0x80, b'\n'][..], false)?;

        assert_eq!(output, "A\u{fffd}\n");
        Ok(())
    }

    #[test]
    fn monitor_drain_has_a_per_tick_budget() {
        let (sender, receiver) = std::sync::mpsc::channel();
        for line in ["one", "two", "three"] {
            assert!(sender.send(line.to_string()).is_ok());
        }

        let mut drained = Vec::new();
        let queue_empty = ProcessRunner::drain_lines(&receiver, 2, |line| drained.push(line));

        assert!(!queue_empty);
        assert_eq!(drained, ["one", "two"]);

        let queue_empty = ProcessRunner::drain_lines(&receiver, 2, |line| drained.push(line));
        assert!(queue_empty);
        assert_eq!(drained, ["one", "two", "three"]);
    }

    #[test]
    fn gate_requires_explicit_release() -> Result<()> {
        let gate = NamedTempFile::new()?;

        let error = ProcessRunner::wait_for_gate(gate.path(), Duration::from_millis(20))
            .err()
            .ok_or_else(|| anyhow::anyhow!("Unreleased gate unexpectedly opened"))?;

        assert!(error.to_string().contains("was not released"));
        Ok(())
    }

    #[test]
    fn preserves_managed_command_configuration() {
        let mut command = Command::new("tool.exe");
        command
            .args(["first", "second"])
            .current_dir("C:/workspace")
            .env("UBUILD_TEST_VALUE", "configured")
            .env_remove("UBUILD_TEST_REMOVED");

        let spec = ManagedProcessSpec::from_command(&command);

        assert_eq!(spec.program, std::path::Path::new("tool.exe"));
        assert_eq!(spec.args, ["first", "second"]);
        assert_eq!(
            spec.cwd.as_deref(),
            Some(std::path::Path::new("C:/workspace"))
        );
        assert!(spec.environment.iter().any(|(key, value)| {
            key == "UBUILD_TEST_VALUE"
                && value.as_deref() == Some(std::ffi::OsStr::new("configured"))
        }));
        assert!(spec
            .environment
            .iter()
            .any(|(key, value)| key == "UBUILD_TEST_REMOVED" && value.is_none()));
    }

    #[test]
    fn managed_entry_preserves_target_exit_code() -> Result<()> {
        let mut gate = NamedTempFile::new()?;
        gate.write_all(b"ready")?;
        gate.flush()?;
        let args = [
            OsString::from("--exact"),
            OsString::from("core::process_runner::tests::managed_exit_helper"),
            OsString::from("--ignored"),
        ];

        let exit_code =
            ProcessRunner::run_managed(gate.path(), &std::env::current_exe()?, None, &args)?;

        assert_eq!(exit_code, 7);
        Ok(())
    }

    #[test]
    #[ignore = "helper process for managed_entry_preserves_target_exit_code"]
    fn managed_exit_helper() {
        std::process::exit(7);
    }
}
