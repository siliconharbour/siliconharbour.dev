---
id: s-aafe
status: closed
deps: []
links: []
created: 2026-06-10T16:05:22Z
type: feature
priority: 2
assignee: Jack Arthur Harrhy
tags: [mcp, events, linkedin]
---
# Add MCP createEvent + getManualEvents (manual event entry for AI-driven LinkedIn workaround)

## Why

Per s-d602, there is no public LinkedIn events guest endpoint. The agreed workaround is to let an AI (with browser tooling like chrome-devtools) visit a LinkedIn event URL and then call a manual create function over MCP, mirroring how createJob works for jobs.

We already have createEvent in app/lib/events.server.ts:108 but it's not exposed in the MCP bridge. createJob in app/mcp/bridge.ts:627 is the template.

## Acceptance

1. New CreateEventSchema zod schema (title, description, link, location?, organizer?, startDate, endDate?, startTime?, endTime?, requiresSignup?).
2. New createEvent host function in buildExecuteFunctions() that:
   - parses with CreateEventSchema
   - calls events.server.ts createEvent(event, [date]) with one event_dates row
   - returns { created, eventId, slug, message } shape matching createJob
3. New getManualEvents host function returning all events with importSourceId IS NULL (mirrors getManualJobs which filters sourceType='manual').
4. server.ts system prompt lists createEvent and getManualEvents.
5. Build passes (pnpm run build) and lint passes (pnpm run lint:fix).

## Out of scope

- No UI work (admin already has /manage/events/new).
- No new schema fields.
- No recurring events from MCP — one-time only via a single eventDates row.
- No image upload via MCP — coverImage/iconImage left null; admin can edit after.

