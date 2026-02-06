---
id: s-4d3c
status: closed
deps: [s-30db, s-c197]
links: []
created: 2026-02-06T20:49:45Z
type: task
priority: 2
assignee: Jack Arthur Harrhy
parent: s-6b74
---
# Importer registry and factory

Create app/lib/job-importers/index.ts with registry pattern to get importer by source type. Export getImporter(sourceType) function.

## Acceptance Criteria

- getImporter('greenhouse') returns Greenhouse importer
- getImporter('ashby') returns Ashby importer
- Throws for unknown types
- Easy to add new importers

