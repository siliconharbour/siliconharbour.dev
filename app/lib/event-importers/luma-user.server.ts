/**
 * Luma User Account Event Importer
 *
 * Uses the api2.luma.com internal API that Luma's own frontend calls.
 * No auth required — just needs the x-luma-client-type header.
 *
 * Fetches both future and past events so we catch everything the user has hosted.
 * Description is fetched from the individual event page's OG meta tag.
 */

import type { EventImporter, ImportSourceConfig, FetchedEvent, ValidationResult } from "./types";

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

interface LumaApiResponse {
  entries: LumaApiEntry[];
  has_more: boolean;
  next_cursor?: string;
}

/**
 * Resolve a user identifier to a usr-xxx API ID.
 * Luma profile URLs can use either a usr-xxx ID or a human-readable username.
 * The API requires the usr-xxx form, so we resolve usernames via the page's __NEXT_DATA__.
 */
async function resolveUserApiId(identifier: string): Promise<string> {
  if (identifier.startsWith("usr-")) return identifier;

  // It's a username — fetch the profile page and extract the api_id
  const res = await fetch(`${LUMA_BASE}/user/${identifier}`, {
    headers: { accept: "text/html" },
  });
  if (!res.ok) throw new Error(`Could not load Luma profile for "${identifier}": ${res.status}`);

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`No __NEXT_DATA__ found on Luma profile page for "${identifier}"`);

  const data = JSON.parse(match[1]);
  const apiId = data?.props?.pageProps?.initialData?.user?.api_id as string | undefined;
  if (!apiId) throw new Error(`Could not find user api_id for "${identifier}"`);

  return apiId;
}

/**
 * Fetch all pages of hosted events for a given period ("future" | "past").
 */
async function fetchHostedEventsPaged(
  userApiId: string,
  period: "future" | "past",
): Promise<LumaApiEntry[]> {
  const all: LumaApiEntry[] = [];
  let cursor: string | undefined = undefined;

  while (true) {
    const params = new URLSearchParams({
      pagination_limit: "50",
      period,
      user_api_id: userApiId,
    });
    if (cursor) params.set("pagination_cursor", cursor);

    const res = await fetch(`${LUMA_API}/user/profile/events-hosting?${params}`, {
      headers: LUMA_HEADERS,
    });

    if (!res.ok) {
      throw new Error(`Luma API error ${res.status} for user ${userApiId} (${period})`);
    }

    const data: LumaApiResponse = await res.json();
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
    const match = html.match(/<meta[^>]+name="description"[^>]+content="([^"]{0,2000})"/i)
      ?? html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]{0,2000})"/i);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

/**
 * Parse the local date and time from a Luma ISO string + timezone name.
 *
 * Luma start_at/end_at are UTC ISO strings (e.g. "2026-04-01T15:30:00.000Z").
 * The event.timezone tells us the intended local timezone (e.g. "America/St_Johns").
 * We convert to local time so the stored HH:mm matches what the organizer set.
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

async function fetchUserEvents(identifier: string): Promise<FetchedEvent[]> {
  // Resolve username → usr-xxx if needed (e.g. "EthanDenny" → "usr-MftWJcJzCV9lQ51")
  const userApiId = await resolveUserApiId(identifier);

  // Fetch both future and past events, then deduplicate by api_id
  const [future, past] = await Promise.all([
    fetchHostedEventsPaged(userApiId, "future"),
    fetchHostedEventsPaged(userApiId, "past"),
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

  const results: FetchedEvent[] = [];

  for (const entry of allEntries) {
    const ev = entry.event;
    if (!ev?.api_id || !ev.name?.trim()) continue;

    const externalId = ev.api_id;
    const title = ev.name.trim();
    const eventSlug = ev.url ?? ev.api_id;
    const timezone = ev.timezone ?? "America/St_Johns";

    const geo = ev.geo_address_info;
    const location =
      geo?.full_address ??
      geo?.city_state ??
      geo?.city ??
      (ev.location_type === "online" ? "Online" : "");

    const organizer =
      entry.hosts?.[0]?.name ??
      entry.calendar?.name ??
      "Unknown";

    const link = `${LUMA_BASE}/${eventSlug}`;
    const coverImageUrl = ev.cover_url ?? null;

    const { date: startDate, time: startTime } = parseToLocalDateAndTime(ev.start_at, timezone);
    const { date: endDate, time: endTime } = parseToLocalDateAndTime(ev.end_at, timezone);

    if (!startDate) continue;

    // Fetch description from event page — do this after checking other required fields
    const description = await fetchEventDescription(eventSlug);

    results.push({
      externalId,
      title,
      description,
      location,
      link,
      organizer,
      startDate,
      endDate: endDate || startDate,
      startTime,
      endTime,
      coverImageUrl,
      timezone,
    });
  }

  return results;
}

export const lumaUserImporter: EventImporter = {
  sourceType: "luma-user",

  async fetchEvents(config: ImportSourceConfig): Promise<FetchedEvent[]> {
    return fetchUserEvents(config.sourceIdentifier);
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    try {
      // Fetch just one page of future events to validate the user ID is real
      const params = new URLSearchParams({
        pagination_limit: "1",
        period: "future",
        user_api_id: config.sourceIdentifier,
      });
      const res = await fetch(`${LUMA_API}/user/profile/events-hosting?${params}`, {
        headers: LUMA_HEADERS,
      });
      if (!res.ok) {
        return { valid: false, error: `Luma API returned ${res.status} — check the user ID` };
      }
      const data: LumaApiResponse = await res.json();
      // Count is approximate (one page only), just confirms the user exists
      return { valid: true, eventCount: data.entries.length };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Failed to reach Luma API",
      };
    }
  },
};
