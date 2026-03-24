# Changelog

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
