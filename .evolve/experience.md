# Evolution Experience

- Test coverage: branches 95.5%, functions 100%, lines 100%, statements 99.95%. 1295 tests passing across 48 suites.
- Branch coverage hotspots: engine-resolver.ts (87.89%), clean.ts (90%), list.ts (90%), project-generator.ts (91.17%), build-executor.ts (92.72%).
- engine-resolver.ts uncovered branches are mostly platform-specific Windows registry/launcher paths and error-handling edge cases.
- ESLint warnings: 0. No TODO/FIXME/HACK markers in src/.
- Evolve system was extracted to standalone project on 2026-04-12. Files like self-driver.ts, evolution-reporter.ts no longer exist here.
- Pre-extraction iterations heavily refactored Evolve code inside ubuild; those changes now live in the Evolve repo.
- Post-extraction iterations 52-56 were all SKIP -- caused by stagnation loop (fixed in Evolve).
