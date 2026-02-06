---
id: s-0bd7
status: closed
deps: []
links: []
created: 2026-02-06T20:49:23Z
type: task
priority: 0
assignee: Jack Arthur Harrhy
parent: s-6b74
---
# Database migration for job import tables

Create migration for job_import_sources, imported_jobs, and job_technology_mentions tables with all indexes. Follow existing migration patterns in drizzle/ folder.

## Acceptance Criteria

- Schema added to app/db/schema.ts
- Migration SQL file created in drizzle/
- Journal entry added
- npm run db:migrate succeeds

