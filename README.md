# ubuild

Unreal Engine project management CLI tool for Agent integration.

## Features

- **Project Detection** (`ubuild list`): Detect and analyze Unreal Engine projects
- **Engine Information** (`ubuild engine`): Resolve engine associations and versions
- **Build Execution** (`ubuild build`): Build projects with various configurations
- **Project Generation** (`ubuild generate`): Generate IDE project files (Visual Studio, VSCode, etc.)
- **Project Initialization** (`ubuild init`): Create new Unreal Engine projects (C++ or Blueprint)

## Installation

```bash
# Global installation
npm install -g @zitool/ubuild

# Or as project dependency
npm install @zitool/ubuild --save-dev
```

## Usage

### CLI Commands

```bash
# Detect project in current directory
ubuild list
ubuild ls

# Show engine information
ubuild engine

# Build project (default: Editor, Development, Win64)
ubuild build
ubuild build --target Game --config Shipping
ubuild build --platform Linux --verbose

# Generate IDE project files
ubuild generate
ubuild generate --ide vscode

# Initialize new project
ubuild init --name MyProject --type cpp
ubuild init --name MyBlueprintProject --type blueprint
```

### Programmatic API

```javascript
import UEBuildAPI from '@zitool/ubuild';

// Detect project
const project = await UEBuildAPI.project.detect();

// Resolve engine
const engine = await UEBuildAPI.engine.resolve();

// Build project
const buildResult = await UEBuildAPI.build.execute({
  target: 'Editor',
  config: 'Development',
  platform: 'Win64'
});

// Generate project files
const genResult = await UEBuildAPI.generate.generate({
  ide: 'vscode'
});

// Initialize new project
const initResult = await UEBuildAPI.init.initialize({
  name: 'MyProject',
  type: 'cpp'
});
```

## Command Reference

### `ubuild list` / `ubuild ls`
Detect Unreal Engine project in current directory.

Options:
- `-r, --recursive`: Search recursively for .uproject files
- `-j, --json`: Output result as JSON

### `ubuild engine`
Display engine information for the current project.

Options:
- `-p, --project <path>`: Path to project directory or .uproject file
- `-j, --json`: Output result as JSON

### `ubuild build`
Build Unreal Engine project.

Options:
- `-t, --target <target>`: Build target (Editor, Game, Client, Server) - default: Editor
- `-c, --config <config>`: Build configuration (Debug, DebugGame, Development, Shipping, Test) - default: Development
- `-p, --platform <platform>`: Build platform (Win64, Win32, Linux, Mac, Android, IOS) - default: Win64
- `--project <path>`: Path to project directory or .uproject file
- `--engine-path <path>`: Path to Unreal Engine installation
- `--clean`: Clean build (rebuild everything)
- `--verbose`: Verbose output
- `--dry-run`: Show what would be built without actually building
- `--list-targets`: List available build targets for project

### `ubuild generate` / `ubuild gen`
Generate IDE project files.

Options:
- `-i, --ide <ide>`: IDE type (sln, vscode, clion, xcode, vs2022) - default: sln
- `--project <path>`: Path to project directory or .uproject file
- `--engine-path <path>`: Path to Unreal Engine installation
- `--force`: Force regeneration of project files
- `--list-ides`: List available IDE types

### `ubuild init`
Initialize a new Unreal Engine project.

Options:
- `-n, --name <name>`: Project name (alphanumeric, underscores, hyphens) - required
- `-t, --type <type>`: Project type (cpp, blueprint, blank) - default: cpp
- `--template <template>`: Project template (Basic, FirstPerson, ThirdPerson, etc.) - default: Basic
- `-d, --directory <path>`: Directory to create project in (default: ./<name>)
- `--engine-path <path>`: Path to Unreal Engine installation
- `--force`: Force initialization even if directory is not empty
- `--dry-run`: Show what would be created without actually creating

## Engine Detection

The tool automatically detects Unreal Engine installations using:

1. **Windows Registry**: `HKEY_CURRENT_USER\SOFTWARE\Epic Games\Unreal Engine\Builds`
2. **Launcher Installation**: `%LOCALAPPDATA%\UnrealEngine\Common\LauncherInstalled.dat`
3. **Environment Variables**: `UE_ENGINE_PATH`, `UE_ROOT`, `UNREAL_ENGINE_PATH`
4. **Manual Specification**: `--engine-path` option

When multiple engines are found, the tool will prompt for selection during initialization.

## Development

```bash
# Clone repository
git clone <repository-url>
cd ubuild

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## License

MIT