# ubuild

Unreal Engine project management CLI tool for Agent integration.

## Features

- **Project Detection** (`ubuild list`): Detect and analyze Unreal Engine projects
- **Engine Information** (`ubuild engine`): Resolve engine associations and versions
- **Build Execution** (`ubuild build`): Build projects with various configurations
- **Project Generation** (`ubuild generate`): Generate IDE project files (Visual Studio, VSCode, etc.)
- **Project Initialization** (`ubuild init`): Create new Unreal Engine projects (C++ or Blueprint)
- **Run Project** (`ubuild run`): Run Unreal Engine Editor or Game executable
- **Update Tool** (`ubuild update`): Update ubuild to the latest version
- **Generate Compile Commands** (`ubuild gencodebase`): Generate compile_commands.json for IDE code completion
- **Clean Build Artifacts** (`ubuild clean`): Remove Binaries, Intermediate, and Saved directories

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

# Run project (Editor or Game)
ubuild run
ubuild run --target Game --config Development
ubuild run --build-first

# Generate compile commands for IDE
ubuild gencodebase
ubuild gencodebase --target Editor --config Development

# Update ubuild to latest version
ubuild update

# Clean build artifacts
ubuild clean
ubuild clean --binaries-only
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
  platform: 'Win64',
});

// Generate project files
const genResult = await UEBuildAPI.generate.generate({
  ide: 'vscode',
});

// Initialize new project
const initResult = await UEBuildAPI.init.initialize({
  name: 'MyProject',
  type: 'cpp',
});

// Create concurrent builder/runner
const builder = UEBuildAPI.concurrent.createBuilder();
const runner = UEBuildAPI.concurrent.createRunner();
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
- `-v, --verbose`: Show verbose engine detection details

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

### `ubuild run`

Run Unreal Engine project (Editor or Game executable).

Options:

- `-t, --target <target>`: Run target (Editor, Game, Client, Server) - default: Editor
- `-c, --config <config>`: Build configuration (Debug, DebugGame, Development, Shipping, Test) - default: Development
- `-p, --platform <platform>`: Platform (Win64, Win32, Linux, Mac, Android, IOS) - default: Win64
- `--project <path>`: Path to project directory or .uproject file
- `--engine-path <path>`: Path to Unreal Engine installation
- `--dry-run`: Show what would be run without actually running
- `--build-first`: Build the project before running
- `--no-build`: Do not build, just run existing executable
- `--detached`: Run the process in detached mode (non-blocking)
- `--args <args...>`: Additional arguments to pass to the executable

### `ubuild gencodebase`

Generate compile_commands.json for IDE (VSCode clangd, CLion, etc.).

Options:

- `-t, --target <target>`: Build targets (Editor is recommended for IDE code completion) - default: Editor
- `-c, --config <config>`: Build configuration (Debug, DebugGame, Development, Shipping, Test) - default: Development
- `-p, --platform <platform>`: Platform (Win64, Win32, Linux, Mac) - default: Win64
- `--project <path>`: Path to project directory or .uproject file
- `--engine-path <path>`: Path to Unreal Engine installation
- `--include-plugin-sources`: Include plugin sources in compile commands (default: true)
- `--no-include-plugin-sources`: Exclude plugin sources
- `--include-engine-sources`: Include engine sources in compile commands (default: true)
- `--no-include-engine-sources`: Exclude engine sources
- `--use-engine-includes`: Use engine includes in compile commands (default: true)
- `--no-use-engine-includes`: Do not use engine includes
- `--json`: Output result as JSON

### `ubuild update`

Update ubuild to the latest version.

Automatically detects whether ubuild is installed globally or locally and updates accordingly.

### `ubuild clean`

Clean build artifacts from an Unreal Engine project. Removes Binaries, Intermediate, and Saved directories to force a clean rebuild.

Options:

- `-p, --project <path>`: Path to project directory or .uproject file
- `--engine-path <path>`: Path to Unreal Engine installation
- `--binaries-only`: Only clean Binaries and Intermediate folders (keep Saved)
- `--dry-run`: Show what would be deleted without actually deleting
- `--silent`: Suppress all output

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

## Testing

This project maintains comprehensive test coverage across all modules.

### Test Structure

Tests are co-located with source files using the naming convention `*.test.ts`:

```
src/
├── core/
│   ├── build-executor.ts
│   ├── build-executor.test.ts    # Unit tests for BuildExecutor
│   └── ...
├── commands/
│   ├── build.ts
│   ├── build.test.ts             # Unit tests for build command
│   └── ...
└── utils/
    ├── validator.ts
    ├── validator.test.ts         # Unit tests for Validator
    └── ...
```

### Running Tests

```bash
# Run all tests
npm test

# Run a specific test file
npx jest --runTestsByPath "src/core/build-executor.test.ts"

# Run tests matching a pattern
npx jest -t "BuildExecutor"

# Run tests in watch mode
npx jest --watch
```

### Test Philosophy

- **Co-location**: Tests live next to the code they test for easy navigation
- **Unit focus**: Tests focus on individual modules with mocked dependencies
- **Fast execution**: Tests avoid heavy I/O for quick feedback during development
- **Clear naming**: Test descriptions clearly state the expected behavior

### Writing Tests

When adding new features, include corresponding tests following the existing patterns:

1. Create a `*.test.ts` file alongside your source file
2. Use descriptive test names that explain the expected behavior
3. Mock external dependencies (filesystem, network, etc.)
4. Test both success and error paths

## License

MIT
