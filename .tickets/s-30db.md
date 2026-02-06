---
id: s-30db
status: closed
deps: [s-cdb0]
links: []
created: 2026-02-06T20:49:32Z
type: task
priority: 1
assignee: Jack Arthur Harrhy
parent: s-6b74
---
# Greenhouse importer module

Implement Greenhouse API importer at app/lib/job-importers/greenhouse.server.ts. Uses public API at boards-api.greenhouse.io. Test with CoLab (colabsoftware).

## Acceptance Criteria

- fetchJobs returns all jobs with content
- validateConfig checks board token exists
- Handles API errors gracefully
- Works with CoLab's board

