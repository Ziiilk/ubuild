# Evolution Backlog

Actionable ideas for future iterations, ordered by impact.

## High Impact

### Concurrent Build/Run API / Programmatic API Mismatch
**Status**: Not started
**Type**: FEATURE
**Estimated effort**: Large (200+ lines)

README "Programmatic API" section (lines 79-111) documents an entire `UEBuildAPI` namespace (`project.detect()`, `engine.resolve()`, `build.execute()`, `generate.generate()`, `init.initialize()`, `concurrent.createBuilder()`, `concurrent.createRunner()`) that does not exist. `src/index.ts` only exports Commander registration functions — no `UEBuildAPI` object, no default export.

The mismatch is broader than just `concurrent`. The core classes exist (ProjectDetector, EngineResolver, BuildExecutor, etc.) but are not wrapped in a unified programmatic API surface.

Options:
1. Implement the full `UEBuildAPI` programmatic API surface wrapping existing core modules
2. Remove the entire "Programmatic API" section from README to eliminate the mismatch
3. Implement just the `concurrent` module and update docs to match reality

Note: README.md is outside the allowed evolve file paths, so option 2 cannot be done in evolve iterations.

### Logger Static Method Boilerplate
**Status**: Done
**Type**: REFACTOR
**Estimated effort**: Medium (~50 lines changed)

`logger.ts` has ~100 lines of static methods (lines 274-372) that are pure delegation to `globalLogger`. Could be replaced with a Proxy-based approach or a loop that generates the static methods. Low risk since all paths are tested at 100%.

Completed — replaced 13 static delegation methods (~100 lines) with compact arrow function properties (~15 lines).

## Medium Impact

### Test-only formatError Consistency
**Status**: Done
**Type**: REFACTOR
**Estimated effort**: Small (~20 lines)

4 test files still use inline `error instanceof Error ? error.message : String(error)` instead of `formatError()`. Purely cosmetic — tests only, no production impact.

Completed in commit dc7792a — all 4 test files now import `formatError` from utils.

## Low Impact

(None pending — codebase metrics are saturated.)
