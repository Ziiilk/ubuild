# AGENTS.md

Guidance for coding agents working in this repository.

## Repo shape

- Single-package Node.js + TypeScript CLI project
- Manifest: `package.json`
- Source: `src/`
- Build output: `dist/`
- CLI source entry: `src/cli/index.ts`
- Published bin shim: `bin/ubuild.js`

Keep the existing layer split intact:

- `src/cli/` for top-level command wiring
- `src/commands/` for Commander command registration and CLI-facing flow
- `src/core/` for implementation logic
- `src/types/` for shared interfaces and result/option types
- `src/utils/` for shared helpers like logging and validation

Do not move substantial business logic into `src/cli/`.

## Canonical commands

All main dev commands come from the root `package.json`.

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

- Runs `tsc`
- Uses `tsconfig.json`
- Emits to `dist/`

### Watch

```bash
npm run dev
```

- Runs `tsc --watch`

### Lint

```bash
npm run lint
```

- Runs `eslint src --ext .ts`
- Lint target is `src/**/*.ts`

### Format

```bash
npm run format
```

- Runs `prettier --write src/**/*.ts`
- Format target is `src/**/*.ts`

### Test suite

```bash
npm test
```

- Runs `jest`
- Jest config: `jest.config.js`
- Environment: `node`
- Preset: `ts-jest`
- Test roots: `src/`
- Test filename patterns:
  - `**/*.test.ts`
  - `**/*.spec.ts`

### Run a single test

There is no dedicated npm script for single-test execution. Use Jest CLI directly.

Single test file:

```bash
npx jest --runTestsByPath "src/path/to/file.test.ts"
```

Single named test:

```bash
npx jest -t "test name"
```

Reality check:

- Jest is configured with 42 test files covering core modules, commands, types, and utilities
- All tests pass: `npm test`
- Single-test execution works via Jest CLI: `npx jest --runTestsByPath "src/path/to/file.test.ts"`

### Publish hooks

These scripts exist and both build the package:

```bash
npm run prepare
npm run prepublishOnly
```

## TypeScript expectations

`tsconfig.json` enables strict TypeScript. Important settings include:

- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`
- `resolveJsonModule: true`

Agent rules:

- Preserve strict typing.
- Prefer explicit interfaces and typed option/result objects.
- Avoid introducing `any` unless there is no better local option.
- Do not use type-suppression comments.
- Prefer fixing types in `src/types/` or local interfaces instead of weakening call sites.

Existing code contains some `as any`; treat that as existing debt, not as the preferred pattern.

## Formatting and style

Formatting comes from `.prettierrc.json`:

- 2-space indentation
- semicolons
- single quotes
- trailing commas in `es5` mode
- `printWidth: 100`
- spaces, not tabs

Match the surrounding file and keep edits Prettier-compatible.

## ESLint notes

ESLint config: `eslint.config.mjs` (flat config format).

- `@typescript-eslint/no-explicit-any` is `warn`
- `@typescript-eslint/no-unused-vars` ignores `_`-prefixed args
- `no-console` warns, except for `warn` and `error`

## Import conventions

Follow the import style already used in `src/`:

- Default imports for modules like `chalk`, `path`, `fs-extra`
- Named imports for internal symbols and many Node/library types

Examples:

```ts
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { Command } from 'commander';
import { Writable } from 'stream';
import { Logger } from '../utils/logger';
```

Practical rules:

- Keep external imports above internal imports.
- Keep internal imports relative and local to the layer you are editing.
- Follow the existing ordering style in nearby files.

## Architecture conventions

### Commands

`src/commands/*.ts` usually:

- export a command options interface when needed
- export a function named `<name>Command(program: Command): void`
- register options and actions with Commander
- validate inputs
- call a class or helper that does the real work
- convert failures into readable CLI output

Examples:

- `src/commands/build.ts`
- `src/commands/generate.ts`
- `src/commands/list.ts`
- `src/commands/run.ts`

### Core modules

Operational logic belongs in `src/core/`, for example:

- `BuildExecutor`
- `EngineResolver`
- `ProjectDetector`
- `ProjectGenerator`
- `ProjectInitializer`

Add behavior to the most relevant existing core module instead of creating parallel abstractions without need.

### Utilities

Prefer reusing helpers in `src/utils/`.

Notable shared utilities:

- `Logger`
- `Validator`

Do not duplicate logging or validation logic inside commands if a shared utility already fits.

### Types

Shared contracts belong in `src/types/`.

If data crosses module boundaries, prefer a named interface or result type over repeated inline object shapes.

## Naming conventions

Match existing naming:

- Classes: PascalCase
- Interfaces: PascalCase
- Functions: camelCase
- Multi-word filenames: kebab-case

Examples:

- `EngineResolver`
- `BuildCommandOptions`
- `buildCommand`
- `engine-resolver.ts`

For new command registration functions, keep the existing `nameCommand` pattern.

## Error handling

The common repo pattern is explicit `try/catch` with readable messages and normalization like:

```ts
error instanceof Error ? error.message : String(error);
```

Rules:

- Use informative user-facing errors.
- Prefer `Logger` for CLI output.
- Throw real `Error` objects for exceptional paths.
- Do not swallow errors silently.
- Do not leave empty catch blocks.
- At the CLI boundary, log clearly and exit non-zero when the command cannot recover.

In core modules, keep returning structured results where that pattern already exists.

## Logging and output

Prefer `Logger` plus `chalk` over ad hoc `console.log` output.

Useful methods already in the repo:

- `logger.info(...)`
- `logger.success(...)`
- `logger.warning(...)`
- `logger.error(...)`
- `logger.title(...)`
- `logger.subTitle(...)`
- `logger.json(...)`

If you change command UX, match the existing CLI tone and output structure.

## Validation-first behavior

Commands usually validate before doing expensive or stateful work.

Preserve that flow:

- validate flags and arguments early
- emit actionable feedback for invalid input
- stop before invoking core execution on invalid input

Reuse `Validator` where it already matches the responsibility.

## Testing guidance

Because Jest is configured with comprehensive test coverage (42 test files), maintain the existing high standard:

- If you add a clear unit boundary, consider adding a Jest test under `src/` with `*.test.ts` or `*.spec.ts` naming.
- If you add a test, verify it with `npx jest --runTestsByPath <path>`.
- If there is no test for the changed area, at minimum run the most relevant build/lint validation.

There is an ad hoc script `test-build.js`, but it is not part of the standard npm workflow. Do not treat it as the official test harness.

## Files worth checking before larger changes

- `package.json`
- `tsconfig.json`
- `jest.config.js`
- `eslint.config.mjs`
- `.prettierrc.json`
- `src/cli/index.ts`
- the relevant file in `src/commands/`
- the corresponding logic in `src/core/`
- any shared contract in `src/types/`

## Cursor and Copilot rules

No repository-specific editor/assistant rule files were found during analysis:

- no `.cursorrules`
- no `.cursor/rules/`
- no `.github/copilot-instructions.md`

There was also no pre-existing root `AGENTS.md`.

## Do / don't summary

Do:

- use `npm run build`, `npm run lint`, and `npm test` as canonical commands
- keep command wiring in `src/commands/` and implementation logic in `src/core/`
- preserve strict TypeScript and existing naming patterns
- use `Logger` for structured CLI output
- keep edits consistent with Prettier
- add shared interfaces when behavior crosses module boundaries

Do not:

- move business logic into `src/cli/`
- invent a second command architecture
- weaken types without need
- assume tests exist without verifying
- assume one ESLint config wins unless tooling proves it
- treat `test-build.js` as the official test workflow
