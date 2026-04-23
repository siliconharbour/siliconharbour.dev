/**
 * Eventbrite Organizer Event Importer
 *
 * Parses the __NEXT_DATA__ JSON blob embedded in Eventbrite organizer pages.
 * This contains structured event data including timezone, venue, and dates.
 * Falls back to JSON-LD itemListElement if __NEXT_DATA__ has no events.
 *
 * The sourceIdentifier is the numeric organizer ID from the URL, e.g. "108767432471"
 * from https://www.eventbrite.ca/o/108767432471
 */

import type { EventImporter, ImportSourceConfig, FetchedEvent, ValidationResult } from "./types";

const EVENTBRITE_BASE = "https://www.eventbrite.ca";

// ---------------------------------------------------------------------------
// __NEXT_DATA__ types (primary source)
// ---------------------------------------------------------------------------

interface NextDataEvent {
  id?: string;
  name?: string;
  summary?: string;
  url?: string;
  start_date?: string; // "YYYY-MM-DD"
  start_time?: string; // "HH:mm:ss"
  end_date?: string;
  end_time?: string;
  timezone?: string;
  is_online_event?: boolean;
  image?: { url?: string };
  primary_venue?: {
    name?: string;
    address?: {
      address_1?: string;
      city?: string;
      region?: string;
      localized_area_display?: string;
    };
  };
}

// ---------------------------------------------------------------------------
// JSON-LD types (legacy fallback)
// ---------------------------------------------------------------------------

interface SchemaOrgEvent {
  "@type"?: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  image?: string;
  location?: {
    name?: string;
    address?: {
      streetAddress?: string;
      addressLocality?: string;
      addressRegion?: string;
    };
  };
  organizer?: { name?: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the numeric event ID from an Eventbrite URL.
 * e.g. "https://www.eventbrite.ca/e/foo-tickets-1985937179564" → "1985937179564"
 * Falls back to the event's own id field if URL pattern doesn't match.
 */
function extractEventId(url: string, fallbackId?: string): string | null {
  const match = url.match(/tickets-(\d+)(?:\?.*)?$/);
  if (match) return match[1];
  // Eventbrite URLs sometimes end with just the numeric ID
  const trailingId = url.match(/(\d{10,})(?:\?.*)?$/);
  if (trailingId) return trailingId[1];
  return fallbackId || null;
}

/**
 * Parse "HH:mm:ss" or "HH:mm" → "HH:mm"
 */
function formatTime(time: string | undefined): string | null {
  if (!time) return null;
  const match = time.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

/**
 * Parse the local date and time from an ISO string with offset (JSON-LD path).
 * e.g. "2026-04-08T11:30:00-0230" → { date: "2026-04-08", time: "11:30" }
 */
function parseISOToLocal(isoString: string | undefined): { date: string; time: string | null } {
  if (!isoString) return { date: "", time: null };
  const match = isoString.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return { date: "", time: null };
  return { date: match[1], time: match[2] };
}

// ---------------------------------------------------------------------------
// __NEXT_DATA__ parser (primary)
// ---------------------------------------------------------------------------

function parseNextDataEvents(html: string): FetchedEvent[] {
  const scriptMatch = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!scriptMatch) return [];

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(scriptMatch[1]);
  } catch {
    return [];
  }

  const pageProps = (data?.props as Record<string, unknown>)?.pageProps as
    | Record<string, unknown>
    | undefined;
  if (!pageProps) return [];

  const organizer = pageProps.organizer as { name?: string } | undefined;
  const organizerName = organizer?.name?.trim() ?? "";

  const upcomingEvents = pageProps.upcomingEvents as NextDataEvent[] | undefined;
  if (!upcomingEvents || !Array.isArray(upcomingEvents)) return [];

  const fetched: FetchedEvent[] = [];

  for (const ev of upcomingEvents) {
    const title = ev.name?.trim();
    if (!title) continue;

    const eventUrl = ev.url ?? "";
    const externalId = extractEventId(eventUrl, ev.id);
    if (!externalId) continue;

    const startDate = ev.start_date ?? "";
    if (!startDate) continue;

    // Build location from venue
    const venue = ev.primary_venue;
    let location = "";
    if (ev.is_online_event) {
      location = "Online";
    } else if (venue) {
      const venueName = venue.name?.trim() ?? "";
      const area = venue.address?.localized_area_display?.trim() ?? "";
      location = [venueName, area].filter(Boolean).join(" — ");
    }

    // Eventbrite provides the image as a pre-sized URL — use it directly
    const coverImageUrl = ev.image?.url ?? null;

    fetched.push({
      externalId,
      title,
      description: ev.summary?.trim() ?? "",
      location,
      link: eventUrl,
      organizer: organizerName,
      startDate,
      endDate: ev.end_date || startDate,
      startTime: formatTime(ev.start_time),
      endTime: formatTime(ev.end_time),
      coverImageUrl,
      timezone: ev.timezone ?? "America/St_Johns",
    });
  }

  return fetched;
}

// ---------------------------------------------------------------------------
// JSON-LD parser (legacy fallback)
// ---------------------------------------------------------------------------

function parseJsonLdEvents(html: string): FetchedEvent[] {
  const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  const fetched: FetchedEvent[] = [];
  let match: RegExpExecArray | null;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (!Array.isArray(data.itemListElement)) continue;

      for (const listItem of data.itemListElement) {
        const ev: SchemaOrgEvent = listItem.item;
        if (!ev || ev["@type"] !== "Event") continue;

        const title = ev.name?.trim();
        if (!title) continue;

        const eventUrl = ev.url ?? "";
        const externalId = extractEventId(eventUrl);
        if (!externalId) continue;

        const placeName = ev.location?.name?.trim() ?? "";
        const addr = ev.location?.address;
        const address = addr
          ? [addr.streetAddress, addr.addressLocality, addr.addressRegion]
              .filter(Boolean)
              .join(", ")
          : "";
        const location = [placeName, address].filter(Boolean).join(" — ");

        const { date: startDate, time: startTime } = parseISOToLocal(ev.startDate);
        const { date: endDate, time: endTime } = parseISOToLocal(ev.endDate);
        if (!startDate) continue;

        fetched.push({
          externalId,
          title,
          description: ev.description?.trim() ?? "",
          location,
          link: eventUrl,
          organizer: ev.organizer?.name?.trim() ?? "",
          startDate,
          endDate: endDate || startDate,
          startTime,
          endTime,
          coverImageUrl: ev.image ?? null,
          timezone: "America/St_Johns",
        });
      }
    } catch {
      // Skip malformed JSON-LD
    }
  }

  return fetched;
}

// ---------------------------------------------------------------------------
// Main fetch
// ---------------------------------------------------------------------------

async function fetchOrganizerEvents(organizerId: string): Promise<FetchedEvent[]> {
  const url = `${EVENTBRITE_BASE}/o/${organizerId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SiliconHarbour/1.0; +https://siliconharbour.dev)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch Eventbrite organizer page: ${res.status}`);
  const html = await res.text();

  // Try __NEXT_DATA__ first (current Eventbrite format)
  const events = parseNextDataEvents(html);
  if (events.length > 0) return events;

  // Fall back to JSON-LD (legacy format)
  return parseJsonLdEvents(html);
}

export const eventbriteImporter: EventImporter = {
  sourceType: "eventbrite",

  async fetchEvents(config: ImportSourceConfig): Promise<FetchedEvent[]> {
    return fetchOrganizerEvents(config.sourceIdentifier);
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    try {
      const events = await fetchOrganizerEvents(config.sourceIdentifier);
      return { valid: true, eventCount: events.length };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Failed to fetch Eventbrite events",
      };
    }
  },
};
