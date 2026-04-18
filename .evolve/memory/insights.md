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

