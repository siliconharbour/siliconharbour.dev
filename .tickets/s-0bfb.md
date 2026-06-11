---
id: s-0bfb
status: closed
deps: []
links: []
created: 2026-06-11T02:23:07Z
type: task
priority: 2
assignee: Jack Arthur Harrhy
tags: [testing, lib]
---
# Core CRUD + lookup test coverage for lib/events.server.ts and lib/jobs.server.ts

## Why

Baseline coverage (s-fa1b) showed events.server.ts at 13.0% lines (8/77 functions) and jobs.server.ts at 5.8% lines (4/21 functions). Both are core entity files with high traffic — any regression hits public listings, manage UI, and the MCP createEntity dispatch.

## What

### test/lib/events-crud.test.ts

Core path:
- createEvent: persists row, generates slug, inserts event_dates, sync references via syncReferences helper.
- createEvent + dates array: multi-date events insert all rows.
- updateEvent: patches fields, regenerates slug on title change, accepts partial dates replacement.
- deleteEvent: cascade through event_dates.
- generateEventSlug: collisions get -2, -3 suffixes; same title in re-edit reuses own slug.

Lookups:
- getEventById / getEventBySlug — returns event with its dates array.
- getPublicEventBySlug — null when importStatus is set and not 'published'; returns event when null or 'published'.
- getAllEvents / getUpcomingEvents — visibility filter, future-only filter.

### test/lib/jobs-crud.test.ts

Core path:
- createJob: persists, generates slug, hooks descriptionText.
- updateJob: patches, regenerates slug on title change.
- deleteJob: removes row.
- generateJobSlug: collision handling.

Lookups:
- getJobById / getJobBySlug — fetches.
- getJobBySlugWithCompany — joins company correctly, returns null when company missing.
- getActiveJobs — includes only status='active'; includeNonTechnical toggle filters isTechnical=false.
- getPaginatedJobs — limit/offset, query filtering via searchContentIds (note: search filter may need stub).

## Acceptance

- ~20 new tests, all passing.
- pnpm coverage shows events.server.ts >= 35% lines and jobs.server.ts >= 50% lines (uplift from 13%/5.8%).
- pnpm run build / lint:fix / test --run all green.
- No new tsc errors.

## Out of scope

- Recurrence machinery (getGeneratedOccurrences, override CRUD, getUpcomingRecurringOccurrences) — that's the next ticket if you want it.
- Pagination edge cases beyond a happy-path call.
- The 'pure' recurrence math in recurrence.server.ts — already at 95.5%.

