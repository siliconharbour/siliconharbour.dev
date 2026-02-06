---
id: s-93bb
status: closed
deps: [s-0bd7, s-30db]
links: []
created: 2026-02-06T20:49:42Z
type: task
priority: 1
assignee: Jack Arthur Harrhy
parent: s-6b74
---
# Job import sync logic

Implement sync algorithm in app/lib/job-importers/sync.server.ts. Handles new jobs, updates, soft deletes (removed), and reactivations. Updates source fetch status.

## Acceptance Criteria

- syncJobs function implements the algorithm from plan
- New jobs get first_seen_at set
- Missing jobs get removed_at and status=removed
- Reactivated jobs clear removed_at
- Source metadata updated after sync

