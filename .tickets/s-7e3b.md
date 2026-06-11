---
id: s-7e3b
status: in_progress
deps: []
links: []
created: 2026-06-11T04:07:56Z
type: feature
priority: 2
assignee: Jack Arthur Harrhy
tags: [events, schema, ui]
---
# All-day event dates support

## Why

Discovered via T.E.A in the Park 2026 (event 204) imported from Eventbrite — multi-day all-day event but the schema/UI/renderers all assume a start time. Currently every event_dates row carries a startDate timestamp and the renderers always emit 'at h:mm a'.

## Schema

Add isAllDay boolean column to event_dates, default false. Migration backfills existing rows to false (preserving current behaviour).

For all-day rows, the startDate / endDate timestamps still anchor the *day* (we keep using a noon-anchored UTC timestamp so the calendar date doesn't drift across timezones) but the time component is ignored by renderers.

## Form (EventForm.tsx)

Each per-date block gets a 'No specific time (all day)' checkbox next to the existing 'Has end time' toggle. Ticking it:
- Hides the Start Time input
- If 'Has end time' was on, hides the End Time input but keeps the End Date (so the range can still span multiple days)
- Persists via a new dates[i][isAllDay] hidden input

## Action / parsing (manage-schemas.ts)

parseOneTimeEventDates picks up the new flag. If isAllDay is true, the parsed entry's startTime is null and endTime is null; otherwise current behaviour.

## Save path (events.server.ts createEvent / updateEvent)

Pass through isAllDay to the eventDates insert. No new helper logic needed.

## Renderers

- events/detail.tsx: branch on isAllDay — render 'EEEE, MMMM d, yyyy' instead of '… at h:mm a'.
- discord-messages.server.ts buildEventsMessage: same branch — 'EEE, MMM d' instead of '… at h:mm a'.
- og-image.server.ts prepareEventOGData: time-stripped formatter when isAllDay.
- routes/events/calendar-ics.tsx (if it exists): emit DTSTART;VALUE=DATE per RFC 5545.

## Importer

eventbrite.server.ts: detect when start_time looks like an all-day Eventbrite signal (Eventbrite uses '00:00:00' for start with full-day end). For now, since the import already landed and may not perfectly detect, plan a manual fix on event 204 after the schema lands — set both dates to isAllDay=true via MCP updateEntity (which means updateEvent's dates array needs to accept the flag — see save path above).

## Acceptance

- Schema migration applied + tests pass.
- Form lets you create a one-time event with isAllDay on at least one date.
- Detail page renders 'Saturday, July 15, 2026' for an all-day event (no time suffix).
- Discord message and OG image branch correctly.
- Event 204 can be patched to all-day via MCP and renders correctly.
- pnpm run build / lint:fix / test --run pass.

