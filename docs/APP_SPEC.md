# v1 (terminal) — runtime spec

## Lifecycle (hard gates)
learn -> review -> exam (hard) -> artifact (hard for core) -> off_dock
- Capstone: final module = "reteach the whole discipline to the LLM" artifact.

## Command surface (terminal)
review | teach <concept|url> | exam <module> | artifact <module> | progress | meta

## Layers
- Runtime (app): SQLite, scheduler (FSRS-lite), terminal UI, agent bridge -> skill engine.
- Engine (skills/teach-me): behavior contract; never own scheduling UI.
- The app never decides curriculum; the skill never decides UI.

## Scheduler (FSRS-lite)
- pass x2 (cap 60d) | partial x1.3 | fail x0.4 (floor 1d)
- due_at <= today -> due. Order: overdue -> lowest ease -> oldest. Cap 10 items/15 min, rollover fwd.

## DB
DDL in `db/schema.sql`. Stages: concepts.stage {docket, off_docket, eventually};
module off_docket only after exam passed + (core) artifact done.

## Build order
M1 shell + today-pill -> M2 schema + scheduler + review flow -> M3 notifications/catch-up -> M4 threads/tree
