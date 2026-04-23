/**
 * Luma Calendar Event Importer
 *
 * Fetches events from a Luma Calendar page (e.g. luma.com/fintechcadence).
 * Uses the api2.luma.com internal API — same as luma-user but with the
 * calendar/get-items endpoint and calendar_api_id parameter.
 *
 * Calendar pages are distinct from user profile pages. They have a slug
 * (e.g. "fintechcadence") that resolves to a cal-xxx API ID, and events
 * are fetched via the calendar items endpoint rather than user hosted events.
 */

import type { EventImporter, ImportSourceConfig, FetchedEvent, ValidationResult } from "./types";
import pLimit from "p-limit";

const LUMA_API = "https://api2.luma.com";
const LUMA_BASE = "https://luma.com";

const LUMA_HEADERS = {
  accept: "*/*",
  "x-luma-client-type": "luma-web",
};

interface LumaApiEntry {
  api_id: string;
  event?: {
    api_id?: string;
    name?: string;
    start_at?: string;
    end_at?: string;
    cover_url?: string;
    location_type?: string;
    url?: string;
    timezone?: string;
    geo_address_info?: {
      full_address?: string;
      city?: string;
      city_state?: string;
    };
  };
  calendar?: {
    name?: string;
  };
  hosts?: Array<{ name?: string }>;
  start_at?: string;
}

interface LumaCalendarApiResponse {
  entries: LumaApiEntry[];
  has_more: boolean;
  next_cursor?: string;
}

/**
 * Resolve a calendar slug to a cal-xxx API ID.
 * Calendar URLs use a slug (e.g. "fintechcadence") or already have a cal-xxx ID.
 * We resolve slugs via the page's __NEXT_DATA__.
 */
async function resolveCalendarApiId(identifier: string): Promise<string> {
  if (identifier.startsWith("cal-")) return identifier;

  // It's a slug — fetch the calendar page and extract the api_id
  const res = await fetch(`${LUMA_BASE}/${identifier}`, {
    headers: { accept: "text/html" },
  });
  if (!res.ok)
    throw new Error(`Could not load Luma calendar page for "${identifier}": ${res.status}`);

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`No __NEXT_DATA__ found on Luma page for "${identifier}"`);

  const data = JSON.parse(match[1]);
  const kind = data?.props?.pageProps?.initialData?.kind as string | undefined;
  if (kind !== "calendar") {
    throw new Error(
      `Luma page "${identifier}" is not a calendar (found kind="${kind ?? "unknown"}"). Use "Luma (User)" for user profile pages.`,
    );
  }

  const apiId = data?.props?.pageProps?.initialData?.data?.calendar?.api_id as string | undefined;
  if (!apiId) throw new Error(`Could not find calendar api_id for "${identifier}"`);

  return apiId;
}

/**
 * Fetch all pages of calendar events for a given period ("future" | "past").
 */
async function fetchCalendarEventsPaged(
  calendarApiId: string,
  period: "future" | "past",
): Promise<LumaApiEntry[]> {
  const all: LumaApiEntry[] = [];
  let cursor: string | undefined = undefined;

  while (true) {
    const params = new URLSearchParams({
      pagination_limit: "50",
      period,
      calendar_api_id: calendarApiId,
    });
    if (cursor) params.set("pagination_cursor", cursor);

    const res = await fetch(`${LUMA_API}/calendar/get-items?${params}`, {
      headers: LUMA_HEADERS,
    });

    if (!res.ok) {
      throw new Error(`Luma calendar API error ${res.status} for ${calendarApiId} (${period})`);
    }

    const data: LumaCalendarApiResponse = await res.json();
    all.push(...data.entries);

    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return all;
}

/**
 * Fetch the OG description from an event's public page.
 * Returns empty string on any error.
 */
async function fetchEventDescription(eventSlug: string): Promise<string> {
  try {
    const res = await fetch(`${LUMA_BASE}/${eventSlug}`, {
      headers: { accept: "text/html" },
    });
    if (!res.ok) return "";
    const html = await res.text();
    const match =
      html.match(/<meta[^>]+name="description"[^>]+content="([^"]{0,2000})"/i) ??
      html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]{0,2000})"/i);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

/**
 * Parse the local date and time from a Luma ISO string + timezone name.
 */
function parseToLocalDateAndTime(
  isoString: string | undefined,
  timezone: string | undefined,
): { date: string; time: string | null } {
  if (!isoString) return { date: "", time: null };
  try {
    const tz = timezone ?? "America/St_Johns";
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date(isoString));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const date = `${get("year")}-${get("month")}-${get("day")}`;
    const time = `${get("hour")}:${get("minute")}`;
    return { date, time };
  } catch {
    return { date: "", time: null };
  }
}

async function fetchCalendarEvents(identifier: string): Promise<FetchedEvent[]> {
  const calendarApiId = await resolveCalendarApiId(identifier);

  // Fetch both future and past events, then deduplicate by api_id
  const [future, past] = await Promise.all([
    fetchCalendarEventsPaged(calendarApiId, "future"),
    fetchCalendarEventsPaged(calendarApiId, "past"),
  ]);

  const seen = new Set<string>();
  const allEntries: LumaApiEntry[] = [];
  for (const entry of [...future, ...past]) {
    const id = entry.event?.api_id ?? entry.api_id;
    if (!seen.has(id)) {
      seen.add(id);
      allEntries.push(entry);
    }
  }

  // Build event data (no async needed), collecting slugs for description fetch
  const pending: { event: Omit<FetchedEvent, "description">; slug: string }[] = [];

  for (const entry of allEntries) {
    const ev = entry.event;
    if (!ev?.api_id || !ev.name?.trim()) continue;

    const eventSlug = ev.url ?? ev.api_id;
    const timezone = ev.timezone ?? "America/St_Johns";

    const geo = ev.geo_address_info;
    const location =
      geo?.full_address ??
      geo?.city_state ??
      geo?.city ??
      (ev.location_type === "online" ? "Online" : "");

    const { date: startDate, time: startTime } = parseToLocalDateAndTime(ev.start_at, timezone);
    const { date: endDate, time: endTime } = parseToLocalDateAndTime(ev.end_at, timezone);

    if (!startDate) continue;

    pending.push({
      slug: eventSlug,
      event: {
        externalId: ev.api_id,
        title: ev.name.trim(),
        location,
        link: `${LUMA_BASE}/${eventSlug}`,
        organizer: entry.calendar?.name ?? entry.hosts?.[0]?.name ?? "Unknown",
        startDate,
        endDate: endDate || startDate,
        startTime,
        endTime,
        coverImageUrl: ev.cover_url ?? null,
        timezone,
      },
    });
  }

  // Fetch descriptions concurrently (bounded to avoid hammering Luma)
  const limit = pLimit(5);
  const results = await Promise.all(
    pending.map(({ event, slug }) =>
      limit(async () => {
        const description = await fetchEventDescription(slug);
        return { ...event, description };
      }),
    ),
  );

  return results;
}

export const lumaCalendarImporter: EventImporter = {
  sourceType: "luma-calendar",

  async fetchEvents(config: ImportSourceConfig): Promise<FetchedEvent[]> {
    return fetchCalendarEvents(config.sourceIdentifier);
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    try {
      const calendarApiId = await resolveCalendarApiId(config.sourceIdentifier);

      const params = new URLSearchParams({
        pagination_limit: "1",
        period: "future",
        calendar_api_id: calendarApiId,
      });
      const res = await fetch(`${LUMA_API}/calendar/get-items?${params}`, {
        headers: LUMA_HEADERS,
      });
      if (!res.ok) {
        return {
          valid: false,
          error: `Luma calendar API returned ${res.status} — check the calendar slug or ID`,
        };
      }
      const data: LumaCalendarApiResponse = await res.json();
      return { valid: true, eventCount: data.entries.length };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Failed to reach Luma API",
      };
    }
  },
};
