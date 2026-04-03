/**
 * Eventbrite Organizer Event Importer
 *
 * Eventbrite embeds a schema.org `itemListElement` JSON-LD block on organizer
 * pages containing all upcoming events with full details — no API key needed.
 *
 * The sourceIdentifier is the numeric organizer ID from the URL, e.g. "108767432471"
 * from https://www.eventbrite.ca/o/108767432471
 */

import type { EventImporter, ImportSourceConfig, FetchedEvent, ValidationResult } from "./types";

const EVENTBRITE_BASE = "https://www.eventbrite.ca";

interface SchemaOrgAddress {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
}

interface SchemaOrgEvent {
  "@type"?: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  image?: string;
  location?: {
    "@type"?: string;
    name?: string;
    address?: SchemaOrgAddress;
  };
  organizer?: {
    name?: string;
    url?: string;
  };
}

interface SchemaOrgListItem {
  "@type"?: string;
  position?: number;
  item?: SchemaOrgEvent;
}

/**
 * Parse the local date and time directly from an ISO string with offset.
 * e.g. "2026-04-08T11:30:00-0230" → { date: "2026-04-08", time: "11:30" }
 * The offset is embedded in the string, so we read the local portion directly.
 */
function parseISOToLocal(isoString: string | undefined): { date: string; time: string | null } {
  if (!isoString) return { date: "", time: null };
  const match = isoString.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return { date: "", time: null };
  return { date: match[1], time: match[2] };
}

/**
 * Infer timezone name from an ISO offset string like "-0230" or "-0330".
 * NST is America/St_Johns — we default to that for known NL offsets.
 */
function inferTimezone(isoString: string | undefined): string {
  if (!isoString) return "America/St_Johns";
  const match = isoString.match(/[+-]\d{4}$/);
  if (!match) return "America/St_Johns";
  // -0230 = NST summer, -0330 = NST winter — both are America/St_Johns
  return "America/St_Johns";
}

/**
 * Extract the numeric event ID from an Eventbrite URL.
 * e.g. "https://www.eventbrite.ca/e/foo-tickets-1985937179564" → "1985937179564"
 */
function extractEventId(url: string): string | null {
  const match = url.match(/tickets-(\d+)(?:\?.*)?$/);
  return match ? match[1] : null;
}

function formatAddress(address: SchemaOrgAddress | undefined): string {
  if (!address) return "";
  const parts = [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
  ].filter(Boolean);
  return parts.join(", ");
}

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

  // Extract the itemListElement JSON-LD block
  const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  const fetched: FetchedEvent[] = [];
  let match: RegExpExecArray | null;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (!Array.isArray(data.itemListElement)) continue;

      const items: SchemaOrgListItem[] = data.itemListElement;

      for (const listItem of items) {
        const ev = listItem.item;
        if (!ev || ev["@type"] !== "Event") continue;

        const title = ev.name?.trim();
        if (!title) continue;

        const eventUrl = ev.url ?? "";
        const externalId = extractEventId(eventUrl);
        if (!externalId) continue;

        const description = ev.description?.trim() ?? "";

        const placeName = ev.location?.name?.trim() ?? "";
        const address = formatAddress(ev.location?.address);
        const location = [placeName, address].filter(Boolean).join(" — ");

        const organizer = ev.organizer?.name?.trim() ?? "";
        const link = eventUrl;
        const coverImageUrl = ev.image ?? null;

        const timezone = inferTimezone(ev.startDate);
        const { date: startDate, time: startTime } = parseISOToLocal(ev.startDate);
        const { date: endDate, time: endTime } = parseISOToLocal(ev.endDate);

        if (!startDate) continue;

        fetched.push({
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
    } catch {
      // Skip malformed JSON-LD
    }
  }

  return fetched;
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
