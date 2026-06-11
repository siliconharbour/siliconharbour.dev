---
id: s-fa1b
status: in_progress
deps: []
links: []
created: 2026-06-11T02:14:51Z
type: task
priority: 2
assignee: Jack Arthur Harrhy
tags: [testing, tooling]
---
# Set up vitest v8 coverage + baseline numbers

## Why

After s-3008 we added 40 new MCP tests but we have no actual coverage numbers. 'Are we under-tested?' is unanswerable without baseline measurement. Vitest's recommended setup (v8 provider, since v3.2 the AST-remapping makes accuracy match istanbul) is straightforward and gives us real data.

## What

1. Install @vitest/coverage-v8 as a devDep matching our vitest 4.1.8.
2. Update vitest.config.ts to enable coverage with sensible defaults:
   - provider: 'v8' (default, recommended)
   - reporter: ['text', 'html', 'json-summary'] — terminal table, browsable HTML, machine-readable summary
   - include: ['app/**/*.{ts,tsx}'] — scope to actual source
   - exclude: route-typegen, generated drizzle migration files, vite/vitest configs
3. Add 'pnpm coverage' script that runs 'vitest run --coverage'.
4. Gitignore coverage/.
5. Run once and capture baseline numbers.

## Out of scope (for now)

- Setting coverage thresholds. Need the baseline first before deciding what to gate.
- Wiring coverage into CI. Same reason.
- Adding any new tests. Pure tooling setup.

## Acceptance

- pnpm coverage produces a clean text report at the end of the suite.
- coverage/index.html renders the per-file breakdown.
- coverage/coverage-summary.json exists.
- Baseline numbers captured in the commit message so we have a reference point.

