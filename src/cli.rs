use clap::{Args, Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "ubuild",
    about = "Unreal Engine project management CLI tool",
    version
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    /// Build Unreal Engine project
    Build(BuildArgs),
    /// Detect and display project information
    List(ListArgs),
    /// Show engine information
    Engine(EngineArgs),
    /// Generate IDE project files
    Generate(GenerateArgs),
    /// Initialize a new Unreal Engine project
    Init(InitArgs),
    /// Run Unreal Engine project
    Run(RunArgs),
    /// Update ubuild to latest version
    Update,
    /// Generate compile_commands.json for clangd
    Gencodebase(GencodebaseArgs),
    /// Clean build artifacts
    Clean(CleanArgs),
    /// Switch engine association
    Switch(SwitchArgs),
    /// Show version information
    Version(VersionArgs),
}

#[derive(Args)]
pub struct BuildArgs {
    /// Build target (Editor, Game, Client, Server)
    #[arg(short, long, default_value = "Editor")]
    pub target: String,

    /// Build configuration (Debug, DebugGame, Development, Shipping, Test)
    #[arg(short, long, default_value = "Development")]
    pub config: String,

    /// Build platform (Win64, Win32, Linux, Mac, Android, IOS)
    #[arg(short, long, default_value = "Win64")]
    pub platform: String,

    /// Path to project directory or .uproject file
    #[arg(long)]
    pub project: Option<String>,

    /// Path to Unreal Engine installation
    #[arg(long)]
    pub engine_path: Option<String>,

    /// Clean build (rebuild everything)
    #[arg(long)]
    pub clean: bool,

    /// Verbose output
    #[arg(long)]
    pub verbose: bool,

    /// Show what would be built without building
    #[arg(long)]
    pub dry_run: bool,

    /// List available build targets
    #[arg(long)]
    pub list_targets: bool,
}

#[derive(Args)]
pub struct ListArgs {
    /// Path to project or .uproject file
    #[arg(short, long)]
    pub project: Option<String>,

    /// Search recursively for .uproject files
    #[arg(short, long)]
    pub recursive: bool,

    /// Output as JSON
    #[arg(short, long)]
    pub json: bool,
}

#[derive(Args)]
pub struct EngineArgs {
    /// Path to project or .uproject file
    #[arg(short, long)]
    pub project: Option<String>,

    /// Output as JSON
    #[arg(short, long)]
    pub json: bool,

    /// Show verbose detection details
    #[arg(short, long)]
    pub verbose: bool,
}

#[derive(Args)]
pub struct GenerateArgs {
    /// IDE type (sln, vscode, clion, xcode, vs2022)
    #[arg(short, long, default_value = "sln")]
    pub ide: String,

    /// Path to project directory or .uproject file
    #[arg(long)]
    pub project: Option<String>,

    /// Path to Unreal Engine installation
    #[arg(long)]
    pub engine_path: Option<String>,

    /// Force regeneration
    #[arg(long)]
    pub force: bool,

    /// List available IDE types
    #[arg(long)]
    pub list_ides: bool,
}

#[derive(Args)]
pub struct InitArgs {
    /// Project name
    #[arg(short, long)]
    pub name: String,

    /// Project type (cpp, blueprint, blank)
    #[arg(short = 't', long = "type", default_value = "cpp")]
    pub project_type: String,

    /// Template (Basic, FirstPerson, ThirdPerson)
    #[arg(long, default_value = "Basic")]
    pub template: String,

    /// Directory to create project in
    #[arg(short, long)]
    pub directory: Option<String>,

    /// Path to Unreal Engine installation
    #[arg(long)]
    pub engine_path: Option<String>,

    /// Override safety checks
    #[arg(long)]
    pub force: bool,
}

#[derive(Args)]
pub struct RunArgs {
    /// Build target (Editor, Game, Client, Server)
    #[arg(short, long, default_value = "Editor")]
    pub target: String,

    /// Build configuration
    #[arg(short, long, default_value = "Development")]
    pub config: String,

    /// Build platform
    #[arg(short, long, default_value = "Win64")]
    pub platform: String,

    /// Path to project directory or .uproject file
    #[arg(long)]
    pub project: Option<String>,

    /// Path to Unreal Engine installation
    #[arg(long)]
    pub engine_path: Option<String>,

    /// Show what would run without running
    #[arg(long)]
    pub dry_run: bool,

    /// Build project before running
    #[arg(long)]
    pub build_first: bool,

    /// Don't build, just run
    #[arg(long)]
    pub no_build: bool,

    /// Run in detached mode (non-blocking)
    #[arg(long)]
    pub detached: bool,

    /// Additional arguments to pass to executable
    #[arg(last = true)]
    pub args: Vec<String>,
}

#[derive(Args)]
pub struct GencodebaseArgs {
    /// Build target
    #[arg(short, long, default_value = "Editor")]
    pub target: String,

    /// Build configuration
    #[arg(short, long, default_value = "Development")]
    pub config: String,

    /// Build platform
    #[arg(short, long, default_value = "Win64")]
    pub platform: String,

    /// Path to project directory or .uproject file
    #[arg(long)]
    pub project: Option<String>,

    /// Path to Unreal Engine installation
    #[arg(long)]
    pub engine_path: Option<String>,

    /// Exclude plugin sources
    #[arg(long)]
    pub no_plugin_sources: bool,

    /// Exclude engine sources
    #[arg(long)]
    pub no_engine_sources: bool,

    /// Don't use engine includes
    #[arg(long)]
    pub no_engine_includes: bool,
}

#[derive(Args)]
pub struct CleanArgs {
    /// Path to project directory or .uproject file
    #[arg(short, long)]
    pub project: Option<String>,

    /// Path to Unreal Engine installation
    #[arg(long)]
    pub engine_path: Option<String>,

    /// Show what would be deleted without deleting
    #[arg(long)]
    pub dry_run: bool,

    /// Clean only Binaries and Intermediate
    #[arg(long)]
    pub binaries_only: bool,
}

#[derive(Args)]
pub struct SwitchArgs {
    /// Path to project directory or .uproject file
    #[arg(short, long)]
    pub project: Option<String>,

    /// Target engine path
    #[arg(long)]
    pub engine_path: Option<String>,
}

#[derive(Args)]
pub struct VersionArgs {
    /// Output as JSON
    #[arg(short, long)]
    pub json: bool,
}
