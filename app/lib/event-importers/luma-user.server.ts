/**
 * Luma User Account Event Importer
 *
 * Luma embeds event data as JSON in __NEXT_DATA__ on user profile pages.
 * We fetch the user page, extract hosted event stubs, then fetch each
 * individual event page for full details.
 *
 * No API key required — uses public HTML pages only.
 */

import type { EventImporter, ImportSourceConfig, FetchedEvent, ValidationResult } from "./types";

const LUMA_BASE = "https://luma.com";

interface LumaNextData {
  props?: {
    pageProps?: {
      initialData?: {
        events_hosted?: LumaEventStub[];
        user?: { name?: string };
      };
    };
  };
}

interface LumaEventStub {
  api_id: string;
  event?: {
    api_id?: string;
    name?: string;
    start_at?: string;
    end_at?: string;
    cover_url?: string;
    location_type?: string;
    url?: string;
  };
  calendar?: {
    name?: string;
    slug?: string;
  };
}

interface LumaEventDetail {
  event?: {
    api_id?: string;
    name?: string;
    description?: string;
    start_at?: string;
    end_at?: string;
    cover_url?: string;
    location_type?: string;
  };
  geo_address_info?: {
    full_address?: string;
    city?: string;
  };
  calendar?: {
    name?: string;
  };
}

function extractNextData<T>(html: string): T | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

function parseISOToDateAndTime(isoString: string | undefined): {
  date: string;
  time: string | null;
} {
  if (!isoString) return { date: "", time: null };
  try {
    const d = new Date(isoString);
    const date = d.toISOString().split("T")[0]; // "YYYY-MM-DD"
    const hours = d.getUTCHours().toString().padStart(2, "0");
    const minutes = d.getUTCMinutes().toString().padStart(2, "0");
    const time = `${hours}:${minutes}`;
    return { date, time };
  } catch {
    return { date: "", time: null };
  }
}

async function fetchLumaPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SiliconHarbour/1.0; +https://siliconharbour.dev)",
      Accept: "text/html",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function fetchEventDetails(eventSlug: string): Promise<LumaEventDetail | null> {
  try {
    const html = await fetchLumaPage(`${LUMA_BASE}/${eventSlug}`);
    const data = extractNextData<{ props?: { pageProps?: { initialData?: LumaEventDetail } } }>(html);
    return data?.props?.pageProps?.initialData ?? null;
  } catch {
    return null;
  }
}

async function fetchUserEvents(userApiId: string): Promise<FetchedEvent[]> {
  const html = await fetchLumaPage(`${LUMA_BASE}/user/${userApiId}`);
  const nextData = extractNextData<LumaNextData>(html);

  const hostedEvents = nextData?.props?.pageProps?.initialData?.events_hosted ?? [];
  const userName = nextData?.props?.pageProps?.initialData?.user?.name ?? "Unknown";

  const results: FetchedEvent[] = [];

  for (const stub of hostedEvents) {
    const ev = stub.event;
    if (!ev?.api_id) continue;

    // The event URL slug on Luma is typically the calendar slug or a short ID
    // Try fetching the event detail page using the event url field if available
    const eventUrl = ev.url ?? ev.api_id;
    const detail = await fetchEventDetails(eventUrl);

    const externalId = ev.api_id;
    const title = detail?.event?.name ?? ev.name ?? "";
    if (!title) continue;

    const description = detail?.event?.description ?? "";
    const location =
      detail?.geo_address_info?.full_address ??
      detail?.geo_address_info?.city ??
      (ev.location_type === "online" ? "Online" : "");
    const organizer = detail?.calendar?.name ?? stub.calendar?.name ?? userName;
    const link = `${LUMA_BASE}/${eventUrl}`;
    const coverImageUrl = detail?.event?.cover_url ?? ev.cover_url ?? null;

    const { date: startDate, time: startTime } = parseISOToDateAndTime(
      detail?.event?.start_at ?? ev.start_at,
    );
    const { date: endDate, time: endTime } = parseISOToDateAndTime(
      detail?.event?.end_at ?? ev.end_at,
    );

    if (!startDate) continue;

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
      timezone: "America/St_Johns",
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
      const events = await fetchUserEvents(config.sourceIdentifier);
      return { valid: true, eventCount: events.length };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Failed to fetch Luma user events",
      };
    }
  },
};
