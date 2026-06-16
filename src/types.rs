use std::path::PathBuf;

use serde::{Deserialize, Serialize};

// ──── Distribution ────

pub const REPO_OWNER: &str = "Ziiilk";
pub const REPO_NAME: &str = "ubuild";

// ──── Build ────

pub const BUILD_TARGETS: &[&str] = &["Editor", "Game", "Client", "Server"];
pub const BUILD_CONFIGS: &[&str] = &["Debug", "DebugGame", "Development", "Shipping", "Test"];
pub const BUILD_PLATFORMS: &[&str] = &["Win64", "Win32", "Linux", "Mac", "Android", "IOS"];
pub const PROJECT_TYPES: &[&str] = &["cpp", "blueprint", "blank"];
pub const IDE_TYPES: &[&str] = &["sln", "vscode", "clion", "xcode", "vs2022"];

pub mod defaults {
    pub const BUILD_TARGET: &str = "Editor";
    pub const BUILD_CONFIG: &str = "Development";
    pub const BUILD_PLATFORM: &str = "Win64";
    pub const PROJECT_TYPE: &str = "cpp";
    pub const BUILD_TEMPLATE: &str = "Basic";
    pub const IDE: &str = "sln";
    pub const MAX_FIND_DEPTH: usize = 3;
}

pub struct BuildResult {
    pub success: bool,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration: std::time::Duration,
}

// ──── Engine ────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineVersionInfo {
    #[serde(rename = "MajorVersion")]
    pub major: u32,
    #[serde(rename = "MinorVersion")]
    pub minor: u32,
    #[serde(rename = "PatchVersion")]
    pub patch: u32,
    #[serde(rename = "Changelist", default)]
    pub changelist: u32,
    #[serde(rename = "CompatibleChangelist", default)]
    pub compatible_changelist: u32,
    #[serde(rename = "IsLicenseeVersion", default)]
    pub is_licensee_version: u32,
    #[serde(rename = "IsPromotedBuild", default)]
    pub is_promoted_build: u32,
    #[serde(rename = "BranchName", default)]
    pub branch_name: String,
    #[serde(rename = "BuildId", default)]
    pub build_id: String,
}

impl std::fmt::Display for EngineVersionInfo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineSource {
    Registry,
    Launcher,
    Environment,
}

impl EngineSource {
    pub fn priority(self) -> u8 {
        match self {
            Self::Launcher => 0,
            Self::Environment => 1,
            Self::Registry => 2,
        }
    }
}

impl std::fmt::Display for EngineSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Registry => f.write_str("registry"),
            Self::Launcher => f.write_str("launcher"),
            Self::Environment => f.write_str("environment"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct EngineInstallation {
    pub path: PathBuf,
    pub association_id: String,
    pub display_name: String,
    pub version: Option<EngineVersionInfo>,
    pub installed_date: Option<String>,
    pub source: EngineSource,
}

#[derive(Debug, Clone)]
pub struct EngineAssociation {
    pub id: String,
    pub name: Option<String>,
    pub path: Option<PathBuf>,
    pub version: Option<String>,
}

pub struct EngineDetectionResult {
    pub engine: Option<EngineInstallation>,
    pub uproject_engine: Option<EngineAssociation>,
    pub warnings: Vec<String>,
}

// ──── Project ────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UProject {
    #[serde(rename = "FileVersion")]
    pub file_version: Option<u32>,
    #[serde(rename = "EngineAssociation", default)]
    pub engine_association: String,
    #[serde(rename = "Modules", default)]
    pub modules: Vec<UProjectModule>,
    #[serde(rename = "Plugins", default)]
    pub plugins: Vec<UProjectPlugin>,
    #[serde(rename = "TargetPlatforms", default)]
    pub target_platforms: Vec<String>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UProjectModule {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "Type")]
    pub module_type: String,
    #[serde(rename = "LoadingPhase")]
    pub loading_phase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UProjectPlugin {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "Enabled", default)]
    pub enabled: bool,
}

#[derive(Debug, Clone)]
pub struct ResolvedTarget {
    pub name: String,
    pub target_type: String,
}

#[derive(Debug, Clone)]
pub struct ProjectInfo {
    pub name: String,
    pub path: PathBuf,
    pub uproject: UProject,
    pub source_dir: Option<PathBuf>,
    pub targets: Vec<ResolvedTarget>,
    pub modules: Vec<ModuleInfo>,
}

#[derive(Debug, Clone)]
pub struct ModuleInfo {
    pub name: String,
    pub path: PathBuf,
}

pub struct ProjectDetectionResult {
    pub project: Option<ProjectInfo>,
    pub warnings: Vec<String>,
}

pub struct ProjectPathResolution {
    pub input_path: PathBuf,
    pub resolved_path: PathBuf,
    pub is_directory: bool,
    pub was_resolved_from_directory: bool,
}

// ──── Operation Results ────

pub struct CleanResult {
    pub deleted_paths: Vec<PathBuf>,
    pub failed_paths: Vec<(PathBuf, String)>,
}

impl CleanResult {
    pub fn success(&self) -> bool {
        self.failed_paths.is_empty()
    }
}

pub struct SwitchResult {
    pub previous_association: String,
    pub new_association: String,
    pub uproject_path: PathBuf,
}

pub struct InitResult {
    pub project_path: PathBuf,
    pub uproject_path: PathBuf,
    pub engine_association: String,
    pub created_files: Vec<PathBuf>,
}

pub struct GenerateResult {
    pub generated_files: Vec<PathBuf>,
}

// ──── Launcher Manifest (serde) ────

#[derive(Debug, Deserialize)]
pub struct LauncherManifest {
    #[serde(rename = "InstallationList", default)]
    pub installation_list: Vec<LauncherEntry>,
}

#[derive(Debug, Deserialize)]
pub struct LauncherEntry {
    #[serde(rename = "AppName", default)]
    pub app_name: String,
    #[serde(rename = "InstallLocation", default)]
    pub install_location: String,
    #[serde(rename = "DisplayName", default)]
    pub display_name: String,
    #[serde(rename = "InstallDate", default)]
    pub install_date: String,
}
