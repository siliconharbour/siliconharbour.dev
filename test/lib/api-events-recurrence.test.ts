/**
 * /api/events recurrence exposure tests.
 *
 * Recurring events with no explicit event_dates rows used to come back
 * with dates: [] and no recurrence info at all, leaving API consumers
 * with no temporal data. We now expose a `recurrence` block on every
 * event in both the list and detail endpoints. Non-recurring events
 * get `recurrence: null`.
 */
import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { events, eventDates } from "~/db/schema";

import { loader as eventsListLoader } from "~/routes/api/events";
import { loader as eventDetailLoader } from "~/routes/api/events.$slug";

interface LoaderArgs {
  request: Request;
  params: Record<string, string>;
  context: unknown;
}

function makeArgs(url: string, params: Record<string, string> = {}): LoaderArgs {
  return {
    request: new Request(`https://example.com${url}`),
    params,
    context: {},
  };
}

async function callJson(
  loader: (args: LoaderArgs) => Promise<Response> | Response,
  url: string,
  params: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const res = await loader(makeArgs(url, params));
  const body = await res.json();
  return { status: res.status, body };
}

interface RecurrenceBlock {
  rule: string;
  start: string | null;
  end: string | null;
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  description: string | null;
}

interface EventResponse {
  slug: string;
  dates: unknown[];
  recurrence: RecurrenceBlock | null;
}

// ---------------------------------------------------------------------------
// Detail endpoint
// ---------------------------------------------------------------------------

describe("GET /api/events/:slug — recurrence field", () => {
  it("returns recurrence: null for a non-recurring event", async () => {
    const [evt] = await db
      .insert(events)
      .values({
        slug: "one-off",
        title: "One Off",
        description: "single event",
        link: "https://example.com",
      })
      .returning();
    await db.insert(eventDates).values({
      eventId: evt.id,
      startDate: new Date("2099-01-01T18:00:00Z"),
    });

    const { status, body } = await callJson(eventDetailLoader, "/api/events/one-off", {
      slug: "one-off",
    });

    expect(status).toBe(200);
    expect((body as EventResponse).recurrence).toBeNull();
  });

  it("returns a full recurrence block for a weekly recurring event (CTS-NL shape)", async () => {
    // Mirror the real cts-nl-meetup row: weekly Thursdays, 7pm-9pm,
    // no explicit event_dates rows.
    const recurrenceStart = new Date("2026-03-19T00:00:00Z");
    await db.insert(events).values({
      slug: "weekly-thu",
      title: "Weekly Thu",
      description: "weekly meetup",
      link: "https://example.com",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=TH",
      recurrenceStart,
      defaultStartTime: "19:00",
      defaultEndTime: "21:00",
    });

    const { status, body } = await callJson(eventDetailLoader, "/api/events/weekly-thu", {
      slug: "weekly-thu",
    });

    expect(status).toBe(200);
    const e = body as EventResponse;
    expect(e.dates).toEqual([]); // no explicit dates, as in production
    expect(e.recurrence).not.toBeNull();
    expect(e.recurrence!.rule).toBe("FREQ=WEEKLY;BYDAY=TH");
    expect(e.recurrence!.start).toBe(recurrenceStart.toISOString());
    expect(e.recurrence!.end).toBeNull();
    expect(e.recurrence!.defaultStartTime).toBe("19:00");
    expect(e.recurrence!.defaultEndTime).toBe("21:00");
    expect(e.recurrence!.description).toBe("Every Thursday");
  });

  it("describes a biweekly rule correctly", async () => {
    await db.insert(events).values({
      slug: "biweekly-tue",
      title: "Biweekly Tue",
      description: "biweekly",
      link: "https://example.com",
      recurrenceRule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU",
      defaultStartTime: "16:30",
    });

    const { body } = await callJson(eventDetailLoader, "/api/events/biweekly-tue", {
      slug: "biweekly-tue",
    });

    const e = body as EventResponse;
    expect(e.recurrence).not.toBeNull();
    expect(e.recurrence!.rule).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU");
    expect(e.recurrence!.description).toBe("Every other Tuesday");
    expect(e.recurrence!.defaultStartTime).toBe("16:30");
    expect(e.recurrence!.defaultEndTime).toBeNull();
  });

  it("serializes recurrenceEnd when present", async () => {
    const end = new Date("2027-01-01T00:00:00Z");
    await db.insert(events).values({
      slug: "bounded",
      title: "Bounded",
      description: "ends",
      link: "https://example.com",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
      recurrenceEnd: end,
    });

    const { body } = await callJson(eventDetailLoader, "/api/events/bounded", {
      slug: "bounded",
    });

    const e = body as EventResponse;
    expect(e.recurrence!.end).toBe(end.toISOString());
  });

  it("returns description: null when the rule is unparseable but rule is still present", async () => {
    await db.insert(events).values({
      slug: "weird-rule",
      title: "Weird",
      description: "weird",
      link: "https://example.com",
      // FREQ=DAILY is a valid RRULE in the wild but unsupported by our
      // parser — parseRecurrenceRule returns null. We still want to
      // expose the raw rule string so consumers can attempt their
      // own parsing.
      recurrenceRule: "FREQ=DAILY",
    });

    const { body } = await callJson(eventDetailLoader, "/api/events/weird-rule", {
      slug: "weird-rule",
    });

    const e = body as EventResponse;
    expect(e.recurrence).not.toBeNull();
    expect(e.recurrence!.rule).toBe("FREQ=DAILY");
    expect(e.recurrence!.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// List endpoint
// ---------------------------------------------------------------------------

describe("GET /api/events — recurrence field", () => {
  it("includes a recurring-only event (no explicit dates) and emits its recurrence block", async () => {
    await db.insert(events).values({
      slug: "weekly-only",
      title: "Weekly Only",
      description: "no explicit dates",
      link: "https://example.com",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=TH",
      defaultStartTime: "19:00",
      defaultEndTime: "21:00",
    });

    const { status, body } = await callJson(eventsListLoader, "/api/events");
    expect(status).toBe(200);

    const list = (body as { data: EventResponse[] }).data;
    const weekly = list.find((e) => e.slug === "weekly-only");

    expect(weekly).toBeDefined();
    expect(weekly!.dates).toEqual([]);
    expect(weekly!.recurrence).not.toBeNull();
    expect(weekly!.recurrence!.rule).toBe("FREQ=WEEKLY;BYDAY=TH");
    expect(weekly!.recurrence!.description).toBe("Every Thursday");
    expect(weekly!.recurrence!.defaultStartTime).toBe("19:00");
    expect(weekly!.recurrence!.defaultEndTime).toBe("21:00");
  });

  it("emits recurrence: null for non-recurring events in the list", async () => {
    const [evt] = await db
      .insert(events)
      .values({
        slug: "one-off-list",
        title: "One Off List",
        description: "x",
        link: "https://example.com",
      })
      .returning();
    await db.insert(eventDates).values({
      eventId: evt.id,
      startDate: new Date("2099-01-01T18:00:00Z"),
    });

    const { body } = await callJson(eventsListLoader, "/api/events");
    const list = (body as { data: EventResponse[] }).data;
    const found = list.find((e) => e.slug === "one-off-list");

    expect(found).toBeDefined();
    expect(found!.recurrence).toBeNull();
  });
});
