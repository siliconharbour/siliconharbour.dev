# Recurring Events: Proper Implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make recurring events first-class citizens in iCal feeds (proper RRULE), events listing (stacked card UI), and admin management (recurrenceStart lifecycle).

**Architecture:** Recurring events already have schema support (RRULE, occurrences table, overrides). This work fixes how they surface: iCal emits one VEVENT per series with RRULE/EXDATE instead of exploded individual events; the listing page shows one stacked card per series; a new `recurrenceStart` column anchors when generation begins.

**Tech Stack:** React Router, Drizzle ORM/SQLite, `ics` npm package (v3.8.1), Tailwind CSS

---

### Task 1: Add `recurrenceStart` to schema and migrate

**Files:**
- Modify: `app/db/schema.ts:57-61`
- Create: `drizzle/0038_add_recurrence_start.sql`
- Modify: `drizzle/meta/_journal.json`

**Step 1: Add column to schema**

In `app/db/schema.ts`, after the `recurrenceRule` line (line 58), add:

```typescript
recurrenceStart: integer("recurrence_start", { mode: "timestamp" }), // When the series begins (null = use createdAt)
```

So the recurrence fields block becomes:
```typescript
  // Recurrence fields
  recurrenceRule: text("recurrence_rule"), // RRULE format: "FREQ=WEEKLY;BYDAY=TH"
  recurrenceStart: integer("recurrence_start", { mode: "timestamp" }), // When the series begins (null = use createdAt)
  recurrenceEnd: integer("recurrence_end", { mode: "timestamp" }), // When recurrence stops (null = indefinite)
  defaultStartTime: text("default_start_time"), // HH:mm format for recurring events
  defaultEndTime: text("default_end_time"), // HH:mm format for recurring events
```

**Step 2: Create migration SQL**

Create `drizzle/0038_add_recurrence_start.sql`:
```sql
ALTER TABLE `events` ADD `recurrence_start` integer;
```

**Step 3: Register migration in journal**

Add to `drizzle/meta/_journal.json` entries array (after idx 37):
```json
{
  "idx": 38,
  "version": "6",
  "when": 1768723000000,
  "tag": "0038_add_recurrence_start",
  "breakpoints": true
}
```

**Step 4: Run migration**

Run: `pnpm run db:migrate`
Expected: Migration applies successfully

**Step 5: Commit**

```
git add app/db/schema.ts drizzle/0038_add_recurrence_start.sql drizzle/meta/_journal.json
git commit -m "Add recurrenceStart column to events table"
```

---

### Task 2: Add recurrenceStart to admin schema and form

**Files:**
- Modify: `app/lib/admin/manage-schemas.ts:33-38`
- Modify: `app/components/EventForm.tsx`
- Modify: `app/routes/manage/events/new.tsx:43-67`
- Modify: `app/routes/manage/events/edit.tsx:68-93`

**Step 1: Add recurrenceStart to validation schema**

In `app/lib/admin/manage-schemas.ts`, add `recurrenceStart` to `eventRecurringSchema`:

```typescript
export const eventRecurringSchema = z.object({
  recurrenceRule: zRequiredString("Recurrence pattern"),
  recurrenceStart: zOptionalNullableString,
  defaultStartTime: zRequiredString("Default start time"),
  defaultEndTime: zOptionalNullableString,
  recurrenceEnd: zOptionalNullableString,
});
```

**Step 2: Add Series Start Date to EventForm**

In `app/components/EventForm.tsx`, add state for recurrenceStartDate (near line 100-103, after recurrenceEndDate state):

```typescript
const [recurrenceStartDate, setRecurrenceStartDate] = useState<Date | null>(
  event?.recurrenceStart || null,
);
const [showRecurrenceStartPicker, setShowRecurrenceStartPicker] = useState(false);
```

Then in the recurring settings section (after the "Recurrence Settings" h3, before the Frequency select), add a "Series Start Date" field:

```tsx
{/* Series Start Date */}
<div>
  <label className="block text-xs text-harbour-500 mb-1">Series Start Date (optional)</label>
  <p className="text-xs text-harbour-400 mb-2">When this series began. Leave empty to use creation date.</p>
  <div className="relative">
    <button
      type="button"
      onClick={() => setShowRecurrenceStartPicker(!showRecurrenceStartPicker)}
      className="w-full md:w-auto px-3 py-2 text-left border border-harbour-200 bg-white"
    >
      {recurrenceStartDate
        ? formatInTimezone(recurrenceStartDate, "MMM d, yyyy")
        : "No start date set"}
    </button>
    {recurrenceStartDate && (
      <button
        type="button"
        onClick={() => setRecurrenceStartDate(null)}
        className="ml-2 text-sm text-red-600 hover:underline"
      >
        Clear
      </button>
    )}
    {showRecurrenceStartPicker && (
      <div className="absolute z-10 mt-1 bg-white border border-harbour-200 shadow-lg">
        <DayPicker
          mode="single"
          selected={recurrenceStartDate || undefined}
          onSelect={(date) => {
            setRecurrenceStartDate(date || null);
            setShowRecurrenceStartPicker(false);
          }}
        />
      </div>
    )}
  </div>
</div>
```

Add the hidden input in the recurring hidden inputs section (near line 758-767):
```tsx
{recurrenceStartDate && (
  <input
    type="hidden"
    name="recurrenceStart"
    value={recurrenceStartDate.toISOString().split("T")[0]}
  />
)}
```

**Step 3: Handle recurrenceStart in create action**

In `app/routes/manage/events/new.tsx`, in the recurring event creation (lines 49-67), add `recurrenceStart`:

```typescript
await createEvent(
  {
    title: parsedBase.data.title,
    description: parsedBase.data.description,
    link: parsedBase.data.link,
    location: parsedBase.data.location,
    organizer: parsedBase.data.organizer,
    coverImage,
    iconImage,
    requiresSignup: parsedBase.data.requiresSignup,
    recurrenceRule: parsedRecurring.data.recurrenceRule,
    recurrenceStart: parsedRecurring.data.recurrenceStart
      ? new Date(parsedRecurring.data.recurrenceStart)
      : null,
    recurrenceEnd: parsedRecurring.data.recurrenceEnd
      ? new Date(parsedRecurring.data.recurrenceEnd)
      : null,
    defaultStartTime: parsedRecurring.data.defaultStartTime,
    defaultEndTime: parsedRecurring.data.defaultEndTime,
  },
  [],
);
```

**Step 4: Handle recurrenceStart in edit action**

In `app/routes/manage/events/edit.tsx`, in the recurring event update (lines 74-93), add `recurrenceStart`:

```typescript
await updateEvent(
  id,
  {
    title: parsedBase.data.title,
    description: parsedBase.data.description,
    link: parsedBase.data.link,
    location: parsedBase.data.location,
    organizer: parsedBase.data.organizer,
    requiresSignup: parsedBase.data.requiresSignup,
    ...(coverImage !== undefined && { coverImage }),
    ...(iconImage !== undefined && { iconImage }),
    recurrenceRule: parsedRecurring.data.recurrenceRule,
    recurrenceStart: parsedRecurring.data.recurrenceStart
      ? new Date(parsedRecurring.data.recurrenceStart)
      : null,
    recurrenceEnd: parsedRecurring.data.recurrenceEnd
      ? new Date(parsedRecurring.data.recurrenceEnd)
      : null,
    defaultStartTime: parsedRecurring.data.defaultStartTime,
    defaultEndTime: parsedRecurring.data.defaultEndTime,
  },
  [],
);
```

Also in the one-time branch (lines 100-118), clear recurrenceStart when switching:
```typescript
recurrenceStart: null,
```
alongside the existing `recurrenceRule: null, recurrenceEnd: null, ...` lines.

**Step 5: Commit**

```
git add app/lib/admin/manage-schemas.ts app/components/EventForm.tsx app/routes/manage/events/new.tsx app/routes/manage/events/edit.tsx
git commit -m "Add recurrenceStart field to admin event forms"
```

---

### Task 3: Use recurrenceStart in occurrence generation

**Files:**
- Modify: `app/lib/events.server.ts:584-598`

**Step 1: Update getGeneratedOccurrences to use recurrenceStart**

Replace the `getGeneratedOccurrences` function (lines 584-598) to use `recurrenceStart` as the anchor:

```typescript
export function getGeneratedOccurrences(
  event: Event,
  startDate: Date = new Date(),
  endDate: Date = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
): Date[] {
  if (!event.recurrenceRule) return [];

  const rule = parseRecurrenceRule(event.recurrenceRule);
  if (!rule) return [];

  const effectiveEnd =
    event.recurrenceEnd && event.recurrenceEnd < endDate ? event.recurrenceEnd : endDate;

  // Use recurrenceStart as the generation anchor, falling back to createdAt
  const generationStart = event.recurrenceStart || event.createdAt;

  // Generate from the series anchor but filter to only return dates in [startDate, effectiveEnd]
  const allOccurrences = generateOccurrences(rule, generationStart, effectiveEnd);
  return allOccurrences.filter((d) => d >= startDate);
}
```

This is important: we generate from the series start (so the pattern is anchored correctly) but filter to only the requested window. This ensures biweekly/monthly patterns stay consistent regardless of when you query.

**Step 2: Commit**

```
git add app/lib/events.server.ts
git commit -m "Anchor occurrence generation to recurrenceStart"
```

---

### Task 4: Rewrite iCal feed with proper RRULE

**Files:**
- Modify: `app/routes/calendar-ics.tsx` (full rewrite)

**Step 1: Rewrite the iCal feed**

Replace the entire contents of `app/routes/calendar-ics.tsx` with:

```typescript
import type { Route } from "./+types/calendar-ics";
import { createEvents, type EventAttributes } from "ics";
import { getUpcomingEvents, getEventOccurrenceOverrides } from "~/lib/events.server";
import { parseAsTimezone } from "~/lib/timezone";

function toDateArray(d: Date): [number, number, number, number, number] {
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const events = await getUpcomingEvents();

  const icsEvents: EventAttributes[] = [];
  let isFirst = true;

  for (const event of events) {
    const calMeta = isFirst
      ? { calName: "Silicon Harbour", productId: "siliconharbour.dev/ics" }
      : {};

    if (event.recurrenceRule) {
      // --- Recurring event: emit one VEVENT with RRULE ---
      const seriesStart = event.recurrenceStart || event.createdAt;
      const startTime = event.defaultStartTime || "18:00";

      // Build DTSTART from the first occurrence date + default time
      // We need the first actual occurrence, not just the anchor date
      const firstDate = event.dates[0];
      if (!firstDate) {
        isFirst = false;
        continue;
      }

      const startDate = firstDate.startDate;
      const endDate =
        firstDate.endDate || new Date(startDate.getTime() + 60 * 60 * 1000);

      // Build RRULE string with UNTIL if recurrenceEnd is set
      let rrule = event.recurrenceRule;
      if (event.recurrenceEnd) {
        const untilArr = toDateArray(event.recurrenceEnd);
        const until = `${untilArr[0]}${String(untilArr[1]).padStart(2, "0")}${String(untilArr[2]).padStart(2, "0")}T235959Z`;
        rrule = `${rrule};UNTIL=${until}`;
      }

      // Get all overrides for this event
      const overrides = await getEventOccurrenceOverrides(event.id);
      const cancelledDates: [number, number, number, number, number][] = [];
      const modifiedOverrides: typeof overrides = [];

      for (const override of overrides) {
        if (override.cancelled) {
          // Cancelled occurrences become EXDATE
          const occDateStr = override.occurrenceDate.toISOString().split("T")[0];
          const occDateTime = parseAsTimezone(occDateStr, startTime);
          cancelledDates.push(toDateArray(occDateTime));
        } else if (override.location || override.startTime || override.endTime) {
          // Modified occurrences: EXDATE the original + emit standalone VEVENT
          const occDateStr = override.occurrenceDate.toISOString().split("T")[0];
          const occDateTime = parseAsTimezone(occDateStr, startTime);
          cancelledDates.push(toDateArray(occDateTime));
          modifiedOverrides.push(override);
        }
      }

      // Master recurring VEVENT
      const masterAttrs: EventAttributes = {
        ...calMeta,
        title: event.title,
        description: `https://siliconharbour.dev/events/${event.slug}\n\n${event.description}`,
        location: event.location || undefined,
        url: `https://siliconharbour.dev/events/${event.slug}`,
        start: toDateArray(startDate),
        startInputType: "utc",
        startOutputType: "utc",
        end: toDateArray(endDate),
        endInputType: "utc",
        endOutputType: "utc",
        status: "CONFIRMED" as const,
        transp: "TRANSPARENT" as const,
        categories: ["Tech", "Community"],
        created: toDateArray(event.createdAt),
        lastModified: toDateArray(event.updatedAt),
        uid: `event-${event.id}@siliconharbour.dev`,
        recurrenceRule: rrule,
        exclusionDates: cancelledDates.length > 0 ? cancelledDates : undefined,
      };

      if (event.organizer) {
        masterAttrs.organizer = {
          name: event.organizer,
          email: "admin@siliconharbour.dev",
        };
      }

      icsEvents.push(masterAttrs);
      isFirst = false;

      // Emit standalone VEVENTs for modified occurrences
      for (const override of modifiedOverrides) {
        const occDateStr = override.occurrenceDate.toISOString().split("T")[0];
        const overrideStartTime = override.startTime || startTime;
        const overrideEndTime = override.endTime || event.defaultEndTime;

        const overrideStart = parseAsTimezone(occDateStr, overrideStartTime);
        const overrideEnd = overrideEndTime
          ? parseAsTimezone(occDateStr, overrideEndTime)
          : new Date(overrideStart.getTime() + 60 * 60 * 1000);

        const overrideAttrs: EventAttributes = {
          title: event.title,
          description: override.description
            ? `https://siliconharbour.dev/events/${event.slug}\n\n${override.description}`
            : `https://siliconharbour.dev/events/${event.slug}\n\n${event.description}`,
          location: override.location || event.location || undefined,
          url: `https://siliconharbour.dev/events/${event.slug}`,
          start: toDateArray(overrideStart),
          startInputType: "utc",
          startOutputType: "utc",
          end: toDateArray(overrideEnd),
          endInputType: "utc",
          endOutputType: "utc",
          status: "CONFIRMED" as const,
          transp: "TRANSPARENT" as const,
          categories: ["Tech", "Community"],
          uid: `event-${event.id}-override-${occDateStr.replace(/-/g, "")}@siliconharbour.dev`,
        };

        if (event.organizer) {
          overrideAttrs.organizer = {
            name: event.organizer,
            email: "admin@siliconharbour.dev",
          };
        }

        icsEvents.push(overrideAttrs);
      }
    } else {
      // --- One-time event: emit individual VEVENTs (unchanged) ---
      for (const date of event.dates) {
        const startDate = date.startDate;
        const endDate = date.endDate || new Date(startDate.getTime() + 60 * 60 * 1000);

        const attrs: EventAttributes = {
          ...calMeta,
          title: event.title,
          description: `https://siliconharbour.dev/events/${event.slug}\n\n${event.description}`,
          location: event.location || undefined,
          url: `https://siliconharbour.dev/events/${event.slug}`,
          start: toDateArray(startDate),
          startInputType: "utc",
          startOutputType: "utc",
          end: toDateArray(endDate),
          endInputType: "utc",
          endOutputType: "utc",
          status: "CONFIRMED" as const,
          transp: "TRANSPARENT" as const,
          categories: ["Tech", "Community"],
          created: toDateArray(event.createdAt),
          lastModified: toDateArray(event.updatedAt),
          uid: `${event.id}-${date.id}@siliconharbour.dev`,
        };

        if (event.organizer) {
          attrs.organizer = {
            name: event.organizer,
            email: "admin@siliconharbour.dev",
          };
        }

        icsEvents.push(attrs);
        isFirst = false;
      }
    }
  }

  const { error, value } = createEvents(icsEvents);

  if (error || !value) {
    throw new Response("Failed to generate calendar", { status: 500 });
  }

  return new Response(value, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="siliconharbour-events.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
```

**Step 2: Commit**

```
git add app/routes/calendar-ics.tsx
git commit -m "Emit proper RRULE in iCal feed for recurring events

- Recurring events emit one VEVENT with RRULE instead of 13+ individual events
- Cancelled occurrences become EXDATE entries
- Modified occurrences (location/time overrides) use EXDATE + standalone VEVENT
- One-time events unchanged
- Stable UIDs: event-{id}@siliconharbour.dev for series"
```

---

### Task 5: Stacked card UI for recurring events

**Files:**
- Modify: `app/components/EventCard.tsx`

**Step 1: Import describeRecurrenceRule**

At the top of EventCard.tsx, add the import. Since this runs on the client, we need to import the client-safe function. Actually, `describeRecurrenceRule` in `recurrence.server.ts` has no server-only dependencies - it just does string parsing. But it's in a `.server.ts` file so we can't import it on the client.

Instead, we'll pass a `recurrenceDescription` prop from the server, or duplicate the description logic. The cleaner approach: compute it on the server and pass it through the event data.

Add a `recurrenceDescription` to the event data shape. In `app/lib/events.server.ts`, modify the places that return recurring event data for listings to include the description. The simplest approach: add it to the `EventWithDates` type extension.

Actually, the cleanest way: compute it inline in the card using the same simple logic. Since the RRULE format is simple, we can parse it client-side without importing server modules. Let's add a tiny helper directly in `EventCard.tsx`:

```typescript
function describeRecurrence(rule: string | null): string | null {
  if (!rule) return null;
  const parts = rule.split(";");
  let freq = "";
  let interval = 1;
  let dayCode = "";
  let position = 0;

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "FREQ") freq = value;
    if (key === "INTERVAL") interval = parseInt(value, 10);
    if (key === "BYDAY") {
      const match = value.match(/^(-?\d)?([A-Z]{2})$/);
      if (match) {
        if (match[1]) position = parseInt(match[1], 10);
        dayCode = match[2];
      }
    }
  }

  const dayNames: Record<string, string> = {
    SU: "Sunday", MO: "Monday", TU: "Tuesday", WE: "Wednesday",
    TH: "Thursday", FR: "Friday", SA: "Saturday",
  };
  const day = dayNames[dayCode] || dayCode;

  if (freq === "WEEKLY") {
    return interval === 2 ? `Every other ${day}` : `Every ${day}`;
  }
  if (freq === "MONTHLY") {
    const positions: Record<number, string> = { 1: "First", 2: "Second", 3: "Third", 4: "Fourth", [-1]: "Last" };
    return `${positions[position] || ""} ${day} of every month`.trim();
  }
  return "Recurring";
}
```

**Step 2: Update the default card variant for stacked treatment**

Replace the default card's outer `<Link>` wrapper to include pseudo-element stacking when `event.recurrenceRule` is set.

For the **default card** (starting around line 104), change the outer `<Link>`:

```tsx
<Link
  to={`/events/${event.slug}`}
  className={`group relative block ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all ${event.coverImage ? "pb-3" : ""} ${event.recurrenceRule ? "mt-2 ml-2" : ""}`}
>
  {/* Stacked card effect for recurring events */}
  {event.recurrenceRule && (
    <>
      <div className="absolute -top-2 -left-2 right-2 bottom-2 ring-1 ring-harbour-200/40 bg-harbour-50/50 -z-20" />
      <div className="absolute -top-1 -left-1 right-1 bottom-1 ring-1 ring-harbour-200/60 bg-harbour-50/80 -z-10" />
    </>
  )}
```

Then in the date/info section of the default card (around lines 148-161), replace the "+N more" display with the recurrence description:

```tsx
<div className="mt-2 flex flex-col gap-1">
  <div className="text-sm text-harbour-500">
    {nextDate && (
      <time dateTime={nextDate.startDate.toISOString()}>
        {formatInTimezone(nextDate.startDate, "EEE, MMM d 'at' h:mm a")}
      </time>
    )}
    {event.recurrenceRule ? (
      <span className="text-xs text-harbour-400 ml-2">
        {describeRecurrence(event.recurrenceRule)}
      </span>
    ) : hasMultipleDates ? (
      <span className="text-xs text-harbour-400 ml-2">+{event.dates.length - 1} more</span>
    ) : null}
  </div>

  {event.location && <p className="text-sm text-harbour-400 truncate">{event.location}</p>}
</div>
```

**Step 3: Update the featured card variant similarly**

For the **featured card** (starting around line 18), add the same stacking and recurrence description treatment:

Outer Link gets the margin adjustment:
```tsx
className={`group relative block ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all ${event.coverImage ? "pb-3" : ""} ${event.recurrenceRule ? "mt-2 ml-2" : ""}`}
```

Add stacking pseudo-elements after the Link opening:
```tsx
{event.recurrenceRule && (
  <>
    <div className="absolute -top-2 -left-2 right-2 bottom-2 ring-1 ring-harbour-200/40 bg-harbour-50/50 -z-20" />
    <div className="absolute -top-1 -left-1 right-1 bottom-1 ring-1 ring-harbour-200/60 bg-harbour-50/80 -z-10" />
  </>
)}
```

And replace the "+N more dates" span (around line 80-84) with:
```tsx
{event.recurrenceRule ? (
  <span className="text-xs text-harbour-400">
    {describeRecurrence(event.recurrenceRule)}
  </span>
) : hasMultipleDates ? (
  <span className="text-xs text-harbour-400">
    +{event.dates.length - 1} more date{event.dates.length > 2 ? "s" : ""}
  </span>
) : null}
```

**Step 4: Commit**

```
git add app/components/EventCard.tsx
git commit -m "Add stacked card treatment for recurring events

- Offset pseudo-element rectangles behind the card create paper-stack effect
- Shows recurrence description (Every Thursday) instead of +N more dates
- Retains Recurring badge"
```

---

### Task 6: Limit recurring event dates in listing queries

**Files:**
- Modify: `app/lib/events.server.ts`

**Step 1: Limit synthetic dates for listings**

In `getUpcomingEvents()` (line 247), limit the synthetic dates to just the next 3 occurrences instead of all generated dates. This keeps the card display lean while still providing enough data for sorting and the "+more" indicator.

Find the section where syntheticDates are created (lines 247-266) and add a slice:

```typescript
// Only keep next 3 dates for listing display
const syntheticDates: EventDate[] = generatedDates.slice(0, 3).map((date, i) => {
```

Do the same in `getPaginatedEvents()` (line 443):

```typescript
const syntheticDates: EventDate[] = generatedDates.slice(0, 3).map((date, i) => {
```

**Step 2: Commit**

```
git add app/lib/events.server.ts
git commit -m "Limit recurring event synthetic dates to 3 in listings"
```

---

### Task 7: Build and verify

**Step 1: Run lint**

Run: `pnpm run lint:fix`
Expected: No errors (warnings OK)

**Step 2: Run build**

Run: `pnpm run build`
Expected: Build succeeds

**Step 3: Fix any issues**

If lint or build fails, fix the issues and re-run.

**Step 4: Final commit if fixes were needed**

```
git add -A
git commit -m "Fix lint/build issues from recurring events changes"
```
