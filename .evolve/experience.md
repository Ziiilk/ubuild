# Evolution Experience

- Test coverage: branches 95.5%, functions 100%, lines 100%, statements 99.95%. 1301 tests passing across 48 suites.
- Branch coverage hotspots: engine-resolver.ts (87.89%), clean.ts (90%), list.ts (90%), project-generator.ts (91.17%), build-executor.ts (92.72%).
- engine-resolver.ts uncovered branches are mostly platform-specific Windows registry/launcher paths and error-handling edge cases.
- ESLint warnings: 0. No TODO/FIXME/HACK markers in src/.
- Evolve system was extracted to standalone project on 2026-04-12. Files like self-driver.ts, evolution-reporter.ts no longer exist here.
- Pre-extraction iterations heavily refactored Evolve code inside ubuild; those changes now live in the Evolve repo.
- Post-extraction iterations 52-56 were all SKIP -- caused by stagnation loop (fixed in Evolve).
- Iteration 57: SKIP decision. Verified all 48 test suites pass, build succeeds, 0 lint warnings. Codebase remains exceptionally healthy with no meaningful improvements available.
- Iteration 58: TEST decision. Added 3 tests to list.test.ts covering empty array branches (uproject.Modules, project.targets, project.modules). Branch coverage for list.ts improved from 90% to 93.33%.
- Iteration 59: TEST decision. Added 6 new tests to engine-resolver.test.ts covering uncovered branches: parseMultiLineEntry edge cases, getSourcePriority with undefined source, extractEnginePathFromLineOrSubsequent with REG_SZ on current line, findEnginePathInSubsequentLines registry key boundary, and duplicate engine removal with undefined source. Branch coverage for engine-resolver.ts remains at 87.89% due to platform-specific Windows registry paths that cannot be easily mocked.
