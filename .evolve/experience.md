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

- engine-resolver.ts (~749 lines) is the largest core module. Branch coverage 87.89% (iter 40) → 96%+ after env var fallback + getSourcePriority + parseInt tests.
- project-detector.ts:153 contradicts validator.ts:207 on .uproject Modules validation — FIXED in iter 41. Detector now accepts missing Modules (blueprint projects), only rejects non-array Modules values.
- project-initializer.ts:544 hardcoded ThirdPerson path — FIXED in iter 42. createGameModeSource() now receives template param; ConstructorHelpers pawn class only generated for ThirdPerson template.
- Coverage metrics (iter 41): 98.34% branches, 100% functions/lines, 100% statements. Remaining gaps are defensive `||` fallbacks in core modules.
- Coverage metrics: 98.63% branches (1012/1026). project-initializer.ts now 100% branches. Remaining 14 gaps: engine-resolver (6, mostly dead-code displayName fallbacks), build-executor (2), project-generator (2), clean-executor (1), project-detector (1), test-utils (2).
- `formatEngineVersion()` extracted to src/utils/version.ts (iter 41). Replaced 6 inline `${v.Major}.${v.Minor}.${v.Patch}` duplications across engine-resolver, project-initializer, commands/engine, commands/init.
