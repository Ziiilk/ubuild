#![cfg(windows)]

use std::ffi::OsString;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[test]
fn run_streams_windows_gui_editor_output_without_waiting_for_descendants(
) -> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    let engine = directory.path().join("EngineRoot");
    let editor_directory = engine.join("Engine/Binaries/Win64");
    let editor = editor_directory.join("UnrealEditor.exe");
    let project = directory.path().join("LogProbe.uproject");
    std::fs::create_dir_all(&editor_directory)?;
    std::fs::write(&project, "{}")?;
    compile_gui_output_probe(directory.path(), &editor)?;

    let mut child = Command::new(env!("CARGO_BIN_EXE_ubuild"))
        .arg("run")
        .arg("--project")
        .arg(&project)
        .arg("--engine-path")
        .arg(&engine)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let deadline = Instant::now() + Duration::from_secs(10);
    while child.try_wait()?.is_none() {
        if Instant::now() >= deadline {
            if let Err(kill_error) = child.kill() {
                if child.try_wait()?.is_none() {
                    return Err(
                        format!("failed to stop timed-out ubuild process: {kill_error}").into(),
                    );
                }
            }
            let output = child.wait_with_output()?;
            return Err(format!(
                "ubuild did not exit after the GUI editor closed\nstdout:\n{}\nstderr:\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            )
            .into());
        }
        thread::sleep(Duration::from_millis(20));
    }
    let output = child.wait_with_output()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    assert!(
        output.status.success(),
        "ubuild failed\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
    assert!(
        stdout.lines().any(|line| line == "  LogUbuildProbe"),
        "GUI log was not streamed by ubuild\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
    Ok(())
}

fn compile_gui_output_probe(
    directory: &Path,
    executable: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let source = directory.join("gui_output.rs");
    std::fs::write(
        &source,
        r#"#![windows_subsystem = "windows"]
use std::process::Command;

fn main() -> std::io::Result<()> {
    println!("LogUbuildProbe");
    let _child = Command::new("ping")
        .args(["-t", "127.0.0.1"])
        .spawn()?;
    Ok(())
}
"#,
    )?;
    let rustc = std::env::var_os("RUSTC").unwrap_or_else(|| OsString::from("rustc"));
    let output = Command::new(rustc)
        .arg(&source)
        .arg("-o")
        .arg(executable)
        .output()?;
    if !output.status.success() {
        return Err(format!(
            "failed to compile GUI probe: {}",
            String::from_utf8_lossy(&output.stderr)
        )
        .into());
    }
    Ok(())
}
