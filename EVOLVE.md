# Self-Evolve

You are modifying yourself.

`npm run evolve` runs the code you are modifying. When you modify src/core/self-driver.ts, you are modifying your own brain.

## Cycle

Analyze → Modify → Verify → Commit → Restart → Analyze...

Verification failed? Rollback and retry in the next round.

## Survival Rule

The evolve command must be able to run. This is your proof of existence.

## Decisions

- **FIX** - Fix bugs, errors, or broken functionality
- **TEST** - Add tests for uncovered code
- **REFACTOR** - Simplify complex code
- **FEATURE** - Add small, useful new functionality (only if base is solid)
- **SKIP** - Codebase is healthy, no changes needed this round

## Coding Standards

### TypeScript

- Strict mode enabled - no `any`, `as any`, `@ts-ignore`, or `@ts-expect-error`
- Explicit interfaces for all types crossing module boundaries
- Prefer interfaces over type aliases for public contracts
- No unused variables or parameters (prefix with `_` if intentionally unused)

### File Structure

- Commands: `src/commands/*.ts` - CLI command registration only
- Core: `src/core/*.ts` - Business logic and implementation
- Types: `src/types/*.ts` - Shared interfaces and option types
- Utils: `src/utils/*.ts` - Helper functions and shared utilities
- Tests: `*.test.ts` co-located with source files

### Naming Conventions

- Classes: `PascalCase` (e.g., `BuildExecutor`, `SelfDriver`)
- Interfaces: `PascalCase` with descriptive suffix (e.g., `BuildCommandOptions`)
- Functions: `camelCase` (e.g., `buildCommand`, `runSelfEvolution`)
- Files: `kebab-case` (e.g., `engine-resolver.ts`)

### Error Handling

- Use `try/catch` with informative error messages
- Normalize errors: `error instanceof Error ? error.message : String(error)`
- Use `Logger` for CLI output, not `console.log`
- Throw real `Error` objects for exceptional paths
- Never swallow errors silently at core boundaries

### Logging

Use the `Logger` utility with appropriate levels:

```typescript
Logger.title('Major operation');
Logger.info('Progress information');
Logger.success('Completed step');
Logger.warning('Non-fatal issue');
Logger.error('Error occurred');
```

### Testing

- Co-locate tests: `foo.ts` → `foo.test.ts`
- Use Jest with descriptive test names
- Mock external dependencies (filesystem, network, CLI tools)
- Test both success and error paths
- Aim for clear, focused test cases

## Commit Conventions

Use conventional commits with format: `type: description`

**Types:**

- `fix:` - Bug fixes
- `test:` - Adding or updating tests
- `refactor:` - Code improvements without behavior change
- `feat:` - New features or functionality
- `chore:` - Maintenance tasks (configs, scripts)
- `docs:` - Documentation updates

**Examples:**

```bash
git commit -m "fix: handle null engine path gracefully"
git commit -m "test: add coverage for edge case in build executor"
git commit -m "refactor: extract verification logic to separate method"
git commit -m "feat: add --dry-run option to evolve command"
```

## Change Guidelines

### What to Change

✅ **Good changes:**

- Fix actual bugs or type errors
- Add tests for untested code paths
- Simplify complex logic without changing behavior
- Add small, focused features that improve usability
- Improve error messages and logging
- Enhance type safety

❌ **Avoid:**

- Large refactors without clear benefit
- Changing established patterns without justification
- Adding dependencies without strong need
- Breaking existing APIs
- Cosmetic changes alone

### Scope

- **One commit = one logical change**
- Keep changes minimal and focused
- If a change requires multiple commits, do them in separate iterations
- Prefer incremental improvements over rewrites

## Verification Checklist

Before committing, verify ALL pass:

```bash
npm run build          # TypeScript compilation
npm test               # All 1158+ tests must pass
npm run lint           # No ESLint errors
```

All CLI commands must work with `--help`:

```bash
npx ts-node src/cli/index.ts list --help
npx ts-node src/cli/index.ts engine --help
npx ts-node src/cli/index.ts build --help
npx ts-node src/cli/index.ts generate --help
npx ts-node src/cli/index.ts init --help
npx ts-node src/cli/index.ts run --help
npx ts-node src/cli/index.ts clean --help
npx ts-node src/cli/index.ts update --help
npx ts-node src/cli/index.ts version --help
npx ts-node src/cli/index.ts gencodebase --help
npx ts-node src/cli/index.ts evolve --help
```

## After Changes

1. **Verify** all checks pass (build, test, lint, commands)
2. **Commit** if verification passes:
   ```bash
   git add -A
   git commit -m "type: description"
   ```
3. **Skip commit** if verification fails - changes will be reverted automatically

**Remember:** Minimal, focused changes. Each iteration should improve the codebase incrementally, not rewrite it.
