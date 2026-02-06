---
id: s-cdb0
status: closed
deps: []
links: []
created: 2026-02-06T20:49:28Z
type: task
priority: 0
assignee: Jack Arthur Harrhy
parent: s-6b74
---
# Job importer base types and interface

Create app/lib/job-importers/types.ts with shared types (ImportedJob, ImportSourceConfig, ValidationResult, SyncResult) and base interface (JobImporter).

## Acceptance Criteria

- types.ts created with all interfaces
- Types match the plan in docs/job-import-plan.md
- Exported for use by importer modules

