<!-- RULES FOR THIS FILE
This file records WHAT YOU OBSERVED about this specific codebase.
Concrete facts only: file names, metrics, events, outcomes.

GOOD: "engine-resolver.ts branch coverage improved from 87% to 92% after adding registry-mock tests."
GOOD: "build-executor.ts (~800 lines) is the largest module — REFACTOR attempts hit diff limits."
GOOD: "list.ts uncovered branches are defensive null-checks for optional manifest fields."

BAD: "Iteration 58: TEST decision. Added 3 tests." (per-iteration log — this belongs in .evolve-history.jsonl, NEVER here)
BAD: "Codebase is exceptionally healthy." (subjective — use metrics)
BAD: "I prefer small changes." (behavioral tendency → persona.md, not experience.md)

MAINTENANCE RULES:
- NEVER add "Iteration N: ..." entries. The evolution history is tracked separately.
- Curate: update or replace stale facts rather than accumulating new lines.
- Remove entries that are no longer true (coverage changed, file deleted, etc.).
- Keep this file under 50 lines total. Density > completeness.
- Only edit this file when you have a NEW concrete fact worth recording for future iterations.
- If there is nothing new to record, leave the file unchanged — editing for its own sake wastes an iteration.
-->

- engine-resolver.ts (~773 lines) is the largest core module. Now includes `resolveProjectAndEngine()` which combines `ProjectPathResolver.resolveOrThrow` + `EngineResolver.resolveEnginePath`.
- `resolveProjectAndEngine` extracted to EngineResolver (iter 45). Replaced 4 duplicated resolveOrThrow+resolveEnginePath 2-step patterns in build-executor, project-generator, project-runner, compile-commands-generator.
- project-detector.ts:153 contradicts validator.ts:207 on .uproject Modules validation — FIXED in iter 41. Detector now accepts missing Modules (blueprint projects), only rejects non-array Modules values.
- project-initializer.ts:544 hardcoded ThirdPerson path — FIXED in iter 42. createGameModeSource() now receives template param; ConstructorHelpers pawn class only generated for ThirdPerson template.
- Coverage metrics: 100% branches/funcs/lines/stmts. All files at 100%.
- Zero `as any` type assertions in production code (fully eliminated from earlier debt).
- `formatEngineVersion()` extracted to src/utils/version.ts (iter 41). Replaced 6 inline duplications.
- Logger static delegation methods replaced with compact arrow function properties (iter 43).
