# Recurring Events: Proper Implementation

## Problem

Recurring events (like CTS - every Thursday at 7pm) exist in the schema but surface poorly:

1. iCal feed explodes each recurring event into 13+ individual VEVENTs with no RRULE, flooding subscriber calendars
2. Events listing shows recurring events as regular cards with "+12 more dates" instead of communicating "ongoing series"
3. No `recurrenceStart` field - generation always starts from "now", so there's no anchor for when a series began
4. Occurrence overrides (location changes, cancellations) are invisible to iCal subscribers

## Design

### 1. iCal: Proper RRULE with Exceptions

Rewrite `calendar-ics.tsx` to split recurring vs one-time events:

**Recurring events emit:**
- One master VEVENT with `RRULE` property and `DTSTART` from `recurrenceStart` + `defaultStartTime`
- `UNTIL` appended to RRULE if `recurrenceEnd` is set
- `EXDATE` entries for cancelled occurrences AND overridden occurrences
- Separate standalone VEVENTs for overridden occurrences (with modified location/time/etc)

**UID strategy:**
- Recurring master: `event-{id}@siliconharbour.dev`
- Override standalones: `event-{id}-override-{YYYYMMDD}@siliconharbour.dev`
- One-time events: `{eventId}-{dateId}@siliconharbour.dev` (unchanged)

The `ics` npm package supports `recurrenceRule` and `exclusionDates` natively but not `RECURRENCE-ID`. Modified occurrences use the EXDATE+standalone pattern (exclude original date, add new event for the modification). This is widely compatible with Google Calendar, Apple Calendar, and Outlook.

**One-time events** continue to emit individual VEVENTs as before.

### 2. Events Listing: Stacked Card Treatment

Recurring events render as a single card with offset pseudo-element rectangles behind it (4px and 8px offset, `ring-1 ring-harbour-200`) creating a paper-stack effect. No CSS shadows.

The card shows:
- Next upcoming occurrence date/time/location (with overrides applied)
- Human-readable recurrence description ("Every Thursday") instead of "+12 more dates"
- Existing "Recurring" badge retained

One card per recurring event in listings, sorted by next occurrence.

### 3. Schema: Add `recurrenceStart`

Add `recurrenceStart` (integer timestamp, nullable) to the `events` table.

- Anchors when date generation begins and when iCal DTSTART is set
- For existing events, falls back to `createdAt`
- Exposed in admin form as "Series start date" for recurring events

### 4. Query Layer: Deduplicate in Listings

`getPaginatedEvents` changes for recurring events:
- Only determines: does this event have an occurrence in the timeframe? What's the next one?
- Attaches only the next few dates (not all 13+) for card display
- Detail page continues showing multiple upcoming occurrences (unchanged)

## Files Affected

- `app/db/schema.ts` - add `recurrenceStart` column
- `drizzle/0038_add_recurrence_start.sql` - migration
- `drizzle/meta/_journal.json` - register migration
- `app/routes/calendar-ics.tsx` - rewrite for RRULE support
- `app/components/EventCard.tsx` - stacked card treatment for recurring events
- `app/lib/events.server.ts` - query changes for listing deduplication
- `app/components/EventForm.tsx` - add "Series start date" field
- `app/routes/manage/events/new.tsx` - handle recurrenceStart in create
- `app/routes/manage/events/edit.tsx` - handle recurrenceStart in edit
- `app/lib/admin/manage-schemas.ts` - add recurrenceStart to schema
