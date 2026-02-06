---
id: s-b3df
status: closed
deps: [s-93bb]
links: []
created: 2026-02-06T20:50:04Z
type: task
priority: 1
assignee: Jack Arthur Harrhy
parent: s-6b74
---
# Admin UI: Trigger import action

Create app/routes/manage/import/jobs.run.tsx - action route that triggers syncJobs for a source. Returns results (added/updated/removed counts).

## Acceptance Criteria

- POST action accepts sourceId
- Calls syncJobs and returns results
- Updates UI with sync results
- Handles errors gracefully

