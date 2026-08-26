# Teach Me — the runtime (app)

Infrastructure around the skill engine: local SQLite, scheduler, terminal-first UI, portfolio.

- Consumes the skill contract (`teach`, `review`, `exam`, `artifact`, `progress`, `meta`).
- State is local and private (`state/`, `artifacts/` gitignored).
- Terminal-first v1; desktop app once the loop survives a full module.

Layout: `db/` schema, `src/` future, `state/` runtime, `artifacts/` learner work, `docs/`
