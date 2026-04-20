# Evolution Backlog

Actionable ideas for future iterations, ordered by impact.

## High Impact

### Concurrent Build/Run API
**Status**: Not started
**Type**: FEATURE
**Estimated effort**: Large (200+ lines)

README documents `UBuildAPI.concurrent.createBuilder()` and `UBuildAPI.concurrent.createRunner()` in the programmatic API, but no concurrent module exists in src/. This is a documentation/implementation mismatch.

Options:
1. Implement a basic concurrent module with createBuilder/createRunner wrappers
2. Remove the concurrent API docs from README to eliminate the mismatch

Option 2 is much smaller and corrects a real misleading claim.

### Logger Static Method Boilerplate
**Status**: Not started
**Type**: REFACTOR
**Estimated effort**: Medium (~50 lines changed)

`logger.ts` has ~100 lines of static methods (lines 274-372) that are pure delegation to `globalLogger`. Could be replaced with a Proxy-based approach or a loop that generates the static methods. Low risk since all paths are tested at 100%.

## Medium Impact

### Test-only formatError Consistency
**Status**: Not started
**Type**: REFACTOR
**Estimated effort**: Small (~20 lines)

4 test files still use inline `error instanceof Error ? error.message : String(error)` instead of `formatError()`. Purely cosmetic — tests only, no production impact.

## Low Impact

(None pending — codebase metrics are saturated.)
