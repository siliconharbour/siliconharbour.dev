/**
 * techNL Event Importer
 * Scrapes https://technl.ca/news-events/ and extracts schema.org/Event JSON-LD blocks.
 */

import type { EventImporter, ImportSourceConfig, FetchedEvent, ValidationResult } from "./types";

const TECHNL_EVENTS_URL = "https://technl.ca/news-events/";

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#039;": "'",
  "&apos;": "'",
  "&#038;": "&",
  "&nbsp;": " ",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&[#\w]+;/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

interface SchemaOrgEvent {
  "@type": string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  location?: {
    "@type"?: string;
    name?: string;
    address?: string;
  };
  organizer?: {
    "@type"?: string;
    name?: string;
  };
  offers?: {
    url?: string;
  };
  url?: string;
}

async function fetchTechNLEvents(): Promise<FetchedEvent[]> {
  const response = await fetch(TECHNL_EVENTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch techNL events page: ${response.status}`);
  }
  const html = await response.text();

  // Extract all JSON-LD script blocks
  const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  const fetched: FetchedEvent[] = [];
  let match: RegExpExecArray | null;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data: SchemaOrgEvent = JSON.parse(match[1]);
      if (data["@type"] !== "Event") continue;

      const title = decodeHtmlEntities(data.name?.trim() ?? "");
      if (!title) continue;

      const registrationUrl = data.offers?.url ?? data.url ?? "";
      if (!registrationUrl) continue;

      // Use registration URL as stable externalId (it's unique per event on techNL)
      const externalId = registrationUrl;

      const description = decodeHtmlEntities(data.description?.trim() ?? "");
      const locationName = decodeHtmlEntities(data.location?.name?.trim() ?? "");
      const locationAddress = decodeHtmlEntities(data.location?.address?.trim() ?? "");
      const location = [locationName, locationAddress].filter(Boolean).join(", ");
      const organizer = decodeHtmlEntities(data.organizer?.name?.trim() ?? "techNL");

      // Parse date — techNL provides "YYYY-MM-DD" strings
      const startDate = data.startDate ?? "";
      const endDate = data.endDate ?? startDate;
      if (!startDate) continue;

      fetched.push({
        externalId,
        title,
        description,
        location,
        link: registrationUrl,
        organizer,
        startDate,
        endDate,
        startTime: null, // techNL JSON-LD doesn't include times (only full dates)
        endTime: null,
        coverImageUrl: null,
        timezone: "America/St_Johns",
      });
    } catch {
      // Skip malformed JSON-LD blocks
    }
  }

  return fetched;
}

export const technlImporter: EventImporter = {
  sourceType: "technl",

  async fetchEvents(_config: ImportSourceConfig): Promise<FetchedEvent[]> {
    return fetchTechNLEvents();
  },

  async validateConfig(_config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    try {
      const events = await fetchTechNLEvents();
      return { valid: true, eventCount: events.length };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Failed to fetch techNL events",
      };
    }
  },
};
