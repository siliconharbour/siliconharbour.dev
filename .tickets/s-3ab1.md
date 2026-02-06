---
id: s-3ab1
status: closed
deps: [s-0bd7]
links: []
created: 2026-02-06T20:50:21Z
type: task
priority: 3
assignee: Jack Arthur Harrhy
parent: s-6b74
---
# Jobs API and markdown routes

Add API and markdown routes for imported jobs: /api/jobs, /api/jobs/:id, /directory/companies/:slug/jobs.md for LLM consumption.

## Acceptance Criteria

- GET /api/jobs returns active jobs (filterable by company)
- GET /api/jobs/:id returns job details
- Markdown route for company jobs
- Update llms-txt.tsx to document jobs endpoints

