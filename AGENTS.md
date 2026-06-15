# AGENTS.md

Guidance for coding agents working in this repository.

## Repo shape

- Single-binary Rust CLI project (edition 2021)
- Manifest: `Cargo.toml`
- Source: `src/`
- Build output: `target/`
- Entry point: `src/main.rs`
- CLI definitions: `src/cli.rs`

Layer split:

- `src/cli.rs` — clap derive definitions (Parser, Subcommand, Args)
- `src/commands/` — thin command handlers that validate, call core, format output
- `src/core/` — implementation logic (resolver, executor, detector, generator, etc.)
- `src/types.rs` — shared structs, enums, constants
- `src/error.rs` — `UbuildError` enum via thiserror
- `src/utils/` — shared helpers (Logger, unreal_paths, version)
- `src/platform.rs` — platform detection and path normalization

Do not move business logic into `src/cli.rs` or `src/commands/`.

## Canonical commands

### Build

```bash
cargo build
```

### Build (release, optimized)

```bash
cargo build --release
```

- Produces `target/release/ubuild.exe` (Windows)
- Release profile: `strip=true`, `lto=true`, `codegen-units=1`

### Check (fast compile check, no binary)

```bash
cargo check
```

### Lint

```bash
cargo clippy -- -D warnings
```

### Format

```bash
cargo fmt
```

### Format check

```bash
cargo fmt -- --check
```

### Run

```bash
cargo run -- <subcommand> [args]
```

## Rust / Clippy expectations

`Cargo.toml` lint config:

- `unsafe_code = "forbid"`
- `clippy::pedantic = "warn"` (base)
- `clippy::unwrap_used = "deny"`
- `clippy::expect_used = "warn"`
- Several pedantic lints allowed: `module_name_repetitions`, `missing_errors_doc`, `missing_panics_doc`, `must_use_candidate`, `struct_excessive_bools`, `too_many_lines`, `doc_markdown`, `too_many_arguments`, `fn_params_excessive_bools`, `needless_pass_by_value`, `similar_names`

Agent rules:

- Never use `unsafe`.
- Never use `.unwrap()`. Use `?`, `anyhow::bail!`, or `.ok()` patterns.
- `.expect()` only with genuinely impossible-to-fail cases (rare).
- Prefer `anyhow::Result` at command boundary; `thiserror` enums in core.
- Keep types explicit. Avoid `as` casts; prefer `.into()` / `From` impls.

## Formatting and style

- `cargo fmt` (rustfmt defaults)
- 4-space indentation
- No trailing whitespace
- Match surrounding code style

## Architecture conventions

### CLI (`src/cli.rs`)

- Single `Cli` struct with `#[derive(Parser)]`
- `Command` enum with `#[derive(Subcommand)]`
- Per-command `*Args` structs with `#[derive(Args)]`
- No logic here — only clap annotations

### Commands (`src/commands/`)

Each command file:

- Receives its `*Args` struct
- Validates inputs if needed
- Calls the corresponding core module
- Formats output via `Logger`
- Returns `anyhow::Result<()>`

### Core (`src/core/`)

All operational logic lives here:

- `BuildExecutor` — runs UBT via subprocess
- `ProjectBuilder` — orchestrates build with target listing, dry-run
- `EngineResolver` — finds engine installations (registry, launcher manifest, env)
- `ProjectDetector` — discovers .uproject/.Target.cs/.Build.cs
- `ProjectPathResolver` — resolves project path from user input
- `TargetResolver` — resolves build targets from Source directory
- `ProjectGenerator` — generates IDE project files
- `ProjectInitializer` — scaffolds new UE projects
- `ProjectRunner` — runs built executables
- `CleanExecutor` — removes build artifacts
- `SwitchExecutor` — switches engine association
- `CompileCommandsGenerator` — generates compile_commands.json

Add behavior to the most relevant existing core module.

### Types (`src/types.rs`)

All shared structs, enums, and constants. Key types:

- `BuildResult`, `CleanResult`, `SwitchResult`, `InitResult`, `GenerateResult`
- `EngineVersionInfo`, `EngineInstallation`, `EngineSource`, `EngineAssociation`
- `UProject`, `ProjectInfo`, `ProjectDetectionResult`, `EngineDetectionResult`
- `ResolvedTarget`, `ModuleInfo`
- Constants: `BUILD_TARGETS`, `BUILD_CONFIGS`, `BUILD_PLATFORMS`, `PROJECT_TYPES`, `IDE_TYPES`

### Error (`src/error.rs`)

`UbuildError` enum using `thiserror::Error`. Variants for engine, project, build, IDE errors.

### Utils (`src/utils/`)

- `Logger` — structured CLI output (info, success, warning, error, title, subtitle, json, debug)
- `unreal_paths` — UBT/Build.bat/engine version path resolution
- `version` — version comparison, format, target type inference

### Platform (`src/platform.rs`)

- `is_windows()`, `exe_extension()`, `bat_extension()`, `normalize_path()`

## Naming conventions

- Structs / Enums: `PascalCase`
- Functions / methods: `snake_case`
- Files: `snake_case.rs`
- Constants: `UPPER_SNAKE_CASE`

Examples: `EngineResolver`, `resolve_engine`, `engine_resolver.rs`, `BUILD_TARGETS`

## Error handling

- Core modules: return `anyhow::Result<T>` or domain-specific `Result<T, UbuildError>`
- Commands: propagate with `?`, add context with `.context("...")`
- `main.rs`: catch top-level errors, log via `Logger::error`, exit non-zero
- Never swallow errors silently
- Never leave empty match arms or catch blocks
- Use `error instanceof Error ? error.message : String(error)` pattern equivalent:
  ```rust
  anyhow::bail!("Failed to ...: {e}");
  ```

## Logging and output

Use `Logger` (backed by `console` crate) for all CLI output:

- `Logger::info(msg)`, `Logger::success(msg)`, `Logger::warning(msg)`, `Logger::error(msg)`
- `Logger::title(msg)`, `Logger::subtitle(msg)`, `Logger::divider()`
- `Logger::write(msg)`, `Logger::writeln(msg)`
- `Logger::json(value)` — serializes with `serde_json`
- `Logger::debug(msg)` — only when `UBUILD_DEBUG` env is set

Do not use raw `println!` for user-facing output in commands.

## Dependencies

Core dependencies (keep minimal):

- `clap 4` (derive) — CLI parsing
- `serde` + `serde_json` — JSON serialization
- `anyhow` — top-level error handling
- `thiserror` — structured domain errors
- `console` — terminal styling
- `dialoguer` — interactive prompts
- `glob` — file pattern matching
- `winreg` (Windows only) — registry queries

Do not add dependencies without justification.

## Files worth checking before larger changes

- `Cargo.toml`
- `src/main.rs`
- `src/cli.rs`
- `src/types.rs`
- `src/error.rs`
- the relevant file in `src/commands/`
- the corresponding logic in `src/core/`

## Git conventions

- Commit messages in **English**
- Follow [Conventional Commits](https://www.conventionalcommits.org/) format:
  ```
  <type>: <short description>

  <optional body>
  ```
- Allowed types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `ci`, `perf`, `style`
- Subject line: imperative tone, no trailing period, max 50 chars
- Body: wrap at 72 chars, explain **what** and **why** (not how)
- One logical change per commit — do not mix unrelated changes
- Do not amend or force-push published commits without explicit approval

## Do / don't summary

Do:

- use `cargo check`, `cargo clippy`, and `cargo build` as canonical commands
- keep CLI definitions in `src/cli.rs`, commands in `src/commands/`, logic in `src/core/`
- use `Logger` for structured CLI output
- keep types in `src/types.rs`
- return `anyhow::Result` from commands
- use `?` for error propagation
- add shared types when data crosses module boundaries

Do not:

- use `unsafe` code
- use `.unwrap()`
- move business logic into `src/cli.rs`
- add unnecessary dependencies
- use raw `println!` for user-facing output in commands
- weaken types or add `#[allow(...)]` without need
