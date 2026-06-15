# ubuild

Unreal Engine project management CLI tool — single binary, zero dependencies.

## Features

- **Project Detection** (`ubuild list`) — detect and analyze Unreal Engine projects
- **Engine Information** (`ubuild engine`) — resolve engine associations and versions
- **Build Execution** (`ubuild build`) — build projects with various configurations
- **Project Generation** (`ubuild generate`) — generate IDE project files (Visual Studio, VSCode, etc.)
- **Project Initialization** (`ubuild init`) — create new Unreal Engine projects (C++ or Blueprint)
- **Run Project** (`ubuild run`) — run Unreal Engine Editor or Game executable
- **Generate Compile Commands** (`ubuild gencodebase`) — generate compile_commands.json for clangd
- **Clean Build Artifacts** (`ubuild clean`) — remove Binaries, Intermediate, and Saved directories
- **Switch Engine** (`ubuild switch`) — switch project engine association to a different installation
- **Version** (`ubuild version`) — display version information
- **Update** (`ubuild update`) — show update instructions

## Installation

Download the latest release binary from [Releases](https://github.com/Ziiilk/ubuild/releases) and place it in your PATH.

Or build from source:

```bash
cargo install --path .
```

## Usage

```bash
# Detect project in current directory
ubuild list
ubuild list --recursive --json

# Show engine information
ubuild engine
ubuild engine --verbose --json

# Build project (default: Editor, Development, Win64)
ubuild build
ubuild build --target Game --config Shipping
ubuild build --platform Linux --verbose
ubuild build --dry-run --list-targets

# Generate IDE project files
ubuild generate
ubuild generate --ide vscode
ubuild generate --list-ides

# Initialize new project
ubuild init --name MyProject --type cpp
ubuild init --name MyBlueprintProject --type blueprint

# Run project (Editor or Game)
ubuild run
ubuild run --target Game --build-first
ubuild run --detached -- -log

# Generate compile commands for clangd
ubuild gencodebase
ubuild gencodebase --no-engine-sources

# Clean build artifacts
ubuild clean
ubuild clean --binaries-only --dry-run

# Switch engine association
ubuild switch
ubuild switch --engine-path "C:/Program Files/Epic Games/UE_5.4"

# Display version
ubuild version
ubuild version --json
```

## Command Reference

### `ubuild build`

Build Unreal Engine project.

| Option | Description | Default |
|---|---|---|
| `-t, --target` | Build target (Editor, Game, Client, Server) | Editor |
| `-c, --config` | Configuration (Debug, DebugGame, Development, Shipping, Test) | Development |
| `-p, --platform` | Platform (Win64, Win32, Linux, Mac, Android, IOS) | Win64 |
| `--project` | Path to project directory or .uproject file | cwd |
| `--engine-path` | Path to Unreal Engine installation | auto-detect |
| `--clean` | Clean build (rebuild everything) | |
| `--verbose` | Verbose output | |
| `--dry-run` | Show what would be built without building | |
| `--list-targets` | List available build targets | |

### `ubuild list`

Detect and display project information.

| Option | Description |
|---|---|
| `-p, --project` | Path to project directory or .uproject file |
| `-r, --recursive` | Search recursively for .uproject files |
| `-j, --json` | Output as JSON |

### `ubuild engine`

Show engine information.

| Option | Description |
|---|---|
| `-p, --project` | Path to project directory or .uproject file |
| `-j, --json` | Output as JSON |
| `-v, --verbose` | Show verbose engine detection details |

### `ubuild generate`

Generate IDE project files.

| Option | Description | Default |
|---|---|---|
| `-i, --ide` | IDE type (sln, vscode, clion, xcode, vs2022) | sln |
| `--project` | Path to project directory or .uproject file | cwd |
| `--engine-path` | Path to Unreal Engine installation | auto-detect |
| `--force` | Force regeneration | |
| `--list-ides` | List available IDE types | |

### `ubuild init`

Initialize a new Unreal Engine project.

| Option | Description | Default |
|---|---|---|
| `-n, --name` | Project name (required) | |
| `-t, --type` | Project type (cpp, blueprint, blank) | cpp |
| `--template` | Template (Basic, FirstPerson, ThirdPerson) | Basic |
| `-d, --directory` | Directory to create project in | ./{name} |
| `--engine-path` | Path to Unreal Engine installation | auto-detect |
| `--force` | Force initialization even if directory is not empty | |

### `ubuild run`

Run Unreal Engine project.

| Option | Description | Default |
|---|---|---|
| `-t, --target` | Run target (Editor, Game, Client, Server) | Editor |
| `-c, --config` | Build configuration | Development |
| `-p, --platform` | Platform | Win64 |
| `--project` | Path to project directory or .uproject file | cwd |
| `--engine-path` | Path to Unreal Engine installation | auto-detect |
| `--dry-run` | Show what would be run without running | |
| `--build-first` | Build the project before running | |
| `--no-build` | Do not build, just run existing executable | |
| `--detached` | Run in detached mode (non-blocking) | |
| `-- <args>` | Additional arguments to pass to the executable | |

### `ubuild gencodebase`

Generate compile_commands.json for clangd.

| Option | Description | Default |
|---|---|---|
| `-t, --target` | Build target | Editor |
| `-c, --config` | Build configuration | Development |
| `-p, --platform` | Platform | Win64 |
| `--project` | Path to project directory or .uproject file | cwd |
| `--engine-path` | Path to Unreal Engine installation | auto-detect |
| `--no-plugin-sources` | Exclude plugin sources | |
| `--no-engine-sources` | Exclude engine sources | |
| `--no-engine-includes` | Don't use engine includes | |

### `ubuild clean`

Clean build artifacts.

| Option | Description |
|---|---|
| `-p, --project` | Path to project directory or .uproject file |
| `--engine-path` | Path to Unreal Engine installation |
| `--dry-run` | Show what would be deleted without deleting |
| `--binaries-only` | Only clean Binaries and Intermediate (keep Saved) |

### `ubuild switch`

Switch engine association.

| Option | Description |
|---|---|
| `-p, --project` | Path to project directory or .uproject file |
| `--engine-path` | Path to target Unreal Engine installation |

### `ubuild version`

Display version information.

| Option | Description |
|---|---|
| `-j, --json` | Output as JSON |

### `ubuild update`

Show update instructions.

## Engine Detection

ubuild automatically detects Unreal Engine installations using:

1. **Windows Registry** — `HKEY_CURRENT_USER\SOFTWARE\Epic Games\Unreal Engine\Builds`
2. **Launcher Manifest** — `%LOCALAPPDATA%\UnrealEngine\Common\LauncherInstalled.dat`
3. **Environment Variables** — `UE_ENGINE_PATH`, `UE_ROOT`, `UNREAL_ENGINE_PATH`
4. **Manual** — `--engine-path` option

When multiple engines are found, interactive selection is presented.

## Development

```bash
# Build
cargo build

# Build release (optimized, stripped)
cargo build --release

# Fast compile check
cargo check

# Lint
cargo clippy -- -D warnings

# Format
cargo fmt

# Run
cargo run -- <subcommand> [args]
```

## License

MIT
