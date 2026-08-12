use std::path::PathBuf;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum UbuildError {
    // ── Engine ──
    #[error("Engine path does not exist: {0}")]
    EngineNotFound(PathBuf),

    #[error("Could not determine engine path. Specify --engine-path")]
    EngineUnresolvable,

    #[error(
        "Could not resolve project engine association {association}: {details}. Specify --engine-path explicitly"
    )]
    EngineAssociationUnresolvable {
        association: String,
        details: String,
    },

    #[error("No Unreal Engine installations found. Checked Windows Registry and Epic Launcher. Specify --engine-path manually.")]
    NoEngineInstallations,

    #[error("UnrealBuildTool not found. Tried:\n{}", paths.iter().map(|p| format!("  - {}", p.display())).collect::<Vec<_>>().join("\n"))]
    UbtNotFound { paths: Vec<PathBuf> },

    #[error("RunUAT not found at: {0}")]
    RunUatNotFound(PathBuf),

    // ── Project ──
    #[error("No .uproject file found in: {0}")]
    NoUprojectFound(PathBuf),

    #[error("Project file not found: {0}")]
    ProjectFileNotFound(PathBuf),

    #[error("Invalid .uproject file: {0}")]
    InvalidUproject(String),

    #[error("Project name is required")]
    ProjectNameRequired,

    #[error("Project name can only contain alphanumeric characters, underscores, and hyphens")]
    InvalidProjectName,

    #[error("Directory not safe for initialization: {0}")]
    UnsafeInitDirectory(String),

    // ── Build ──
    #[error("Build failed with exit code {exit_code}")]
    BuildFailed { exit_code: i32, stderr: String },

    #[error("Invalid build configuration: {0}")]
    InvalidBuildConfig(String),

    #[error("Invalid build platform: {0}")]
    InvalidBuildPlatform(String),

    // ── IDE ──
    #[error("Invalid IDE type: {0}")]
    InvalidIdeType(String),

    #[error("Process {0}")]
    Terminated(crate::types::TerminationSignal),

    #[error("Process exited with code {exit_code}")]
    ReportedProcessFailure { exit_code: i32 },

    // ── Generic ──
    #[error("Executable not found: {0}")]
    ExecutableNotFound(PathBuf),
}
