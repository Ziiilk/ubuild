use std::ffi::OsString;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
#[cfg(windows)]
use tempfile::NamedTempFile;

use crate::platform::{self, ChildLifetimeGuard};
use crate::types::ProcessOutput;
use crate::utils::logger::Logger;

const PROCESS_GATE_TIMEOUT: Duration = Duration::from_secs(5);
const PROCESS_GATE_RETRY_INTERVAL: Duration = Duration::from_millis(5);
const PROCESS_OUTPUT_DRAIN_TIMEOUT: Duration = Duration::from_secs(1);
const PROCESS_OUTPUT_DRAIN_RETRY_INTERVAL: Duration = Duration::from_millis(5);

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

    fn finish_forwarders(
        stdout_handle: std::thread::JoinHandle<Result<()>>,
        stderr_handle: std::thread::JoinHandle<Result<()>>,
    ) -> Result<()> {
        let deadline = Instant::now() + PROCESS_OUTPUT_DRAIN_TIMEOUT;
        while Instant::now() < deadline
            && (!stdout_handle.is_finished() || !stderr_handle.is_finished())
        {
            std::thread::sleep(PROCESS_OUTPUT_DRAIN_RETRY_INTERVAL);
        }

        Self::finish_forwarder(stdout_handle, "stdout")?;
        Self::finish_forwarder(stderr_handle, "stderr")
    }

    fn finish_forwarder(
        handle: std::thread::JoinHandle<Result<()>>,
        stream_name: &str,
    ) -> Result<()> {
        if handle.is_finished() {
            handle
                .join()
                .map_err(|_| anyhow::anyhow!("{stream_name} reader thread panicked"))?
        } else {
            Logger::warning(&format!(
                "{stream_name} reader did not finish within {:.1}s; output may be incomplete",
                PROCESS_OUTPUT_DRAIN_TIMEOUT.as_secs_f64()
            ));
            Ok(())
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

struct ManagedChild {
    child: Child,
    lifetime: ChildLifetimeGuard,
    #[cfg(windows)]
    _gate: NamedTempFile,
}

impl ManagedChild {
    #[cfg(windows)]
    fn spawn(command: &mut Command, output_mode: OutputMode) -> Result<Self> {
        let spec = ManagedProcessSpec::from_command(command);
        let mut gate = NamedTempFile::new().context("Failed to create managed process gate")?;

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

        let mut child = helper
            .spawn()
            .with_context(|| format!("Failed to start {}", spec.program.display()))?;
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

        gate.write_all(b"ready")
            .context("Failed to release managed process gate")?;
        gate.flush()
            .context("Failed to flush managed process gate")?;

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
