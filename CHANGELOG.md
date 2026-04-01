# Changelog

## [0.0.11]

- Fix `build` command failing on Windows due to embedded quotes in `-project` argument causing UnrealBuildTool to misinterpret the project path

## [0.0.10]

- Fix `generate` and `gencodebase` commands failing due to spurious quotes in UnrealBuildTool arguments passed via execa

## [0.0.9]

- Extend `clangd.arguments` in generated `.vscode/settings.json` with `--background-index`, `--j=8`, `--index-store-path`, `--pch-storage=disk`, `--limit-results=200`, `--header-insertion=iwyu`
- Disable Microsoft C/C++ IntelliSense (`C_Cpp.intelliSenseEngine: "disabled"`) to let clangd take over

## [0.0.8]

- `gencodebase` command now automatically updates `.vscode/settings.json` with clangd configuration using portable `${workspaceFolder}` paths

## [0.0.7]

- Support concurrent `ubuild build` commands
- `ubuild update` no longer requires confirmation and auto-detects installation type

## [0.0.6]

- Add VS Code tasks generation for `ubuild generate --ide vscode`
  - `ubuild: Build Project` - builds the project
  - `ubuild: Run Project` - builds and runs the project

## [0.0.5]

- Fix gencodebase command not registered

## [0.0.4]

- Add `gencodebase` command for generating compile_commands.json
- Output to `.vscode/` directory with auto-cleanup

## [0.0.3]

- Add `update` command for checking latest version
- Fix engine resolution for launcher vs source build engines
- Fix target file generation for UE5/UE4 compatibility

## [0.0.2]

- Add commands: list, engine, build, generate, init, run
- Project and engine detection
- Build execution and IDE project generation

## [0.0.1]

- Initial release
