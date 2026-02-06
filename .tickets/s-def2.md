---
id: s-def2
status: closed
deps: [s-a2c7]
links: []
created: 2026-02-06T20:49:55Z
type: task
priority: 1
assignee: Jack Arthur Harrhy
parent: s-6b74
---
# Admin UI: Add import source form

Create app/routes/manage/import/jobs.new.tsx - form to add new import source: select company, choose source type (greenhouse/ashby), enter identifier, optional source URL.

## Acceptance Criteria

- Company dropdown (companies without existing source)
- Source type select
- Identifier input with placeholder hints
- Source URL input
- Validation before save
- Redirects to sources list on success

