/**
 * Bevy Community Event Importer
 *
 * Fetches events from Bevy-powered community sites like GDG (Google Developer Groups).
 * Uses their public REST API at {domain}/api/event_slim/for_chapter/{chapterId}/
 *
 * sourceIdentifier format: "{domain}:{chapterId}"
 * e.g. "gdg.community.dev:1383" for GDG St. John's
 */

import type { EventImporter, ImportSourceConfig, FetchedEvent, ValidationResult } from "./types";

interface BevyEvent {
  title?: string;
  start_date?: string;
  description?: string;
  description_short?: string;
  url?: string;
  cropped_picture_url?: string;
  event_type_title?: string;
}

interface BevyApiResponse {
  count: number;
  results: BevyEvent[];
  links: { next: string | null };
}

function parseSourceIdentifier(identifier: string): { domain: string; chapterId: string } {
  const parts = identifier.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid sourceIdentifier "${identifier}". Expected format: "domain:chapterId" (e.g. "gdg.community.dev:1383")`,
    );
  }
  return { domain: parts[0], chapterId: parts[1] };
}

/**
 * Parse UTC ISO string into local date and time components.
 * Bevy dates are UTC — we convert to America/St_Johns for display.
 */
function parseToLocalDateAndTime(
  isoString: string | undefined,
): { date: string; time: string | null } {
  if (!isoString) return { date: "", time: null };
  try {
    const tz = "America/St_Johns";
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

/**
 * Strip HTML tags for a plain text description fallback.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function fetchBevyEvents(
  domain: string,
  chapterId: string,
  status: "Live" | "Completed",
): Promise<BevyEvent[]> {
  const fields =
    "title,start_date,event_type_title,cropped_picture_url,url,description_short,description";
  const order = status === "Live" ? "start_date" : "-start_date";
  const url =
    `https://${domain}/api/event_slim/for_chapter/${chapterId}/` +
    `?page_size=50&status=${status}&include_cohosted_events=true` +
    `&order=${order}&fields=${fields}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; SiliconHarbour/1.0; +https://siliconharbour.dev)",
    },
  });

  if (!res.ok) {
    throw new Error(`Bevy API error ${res.status} for chapter ${chapterId} on ${domain}`);
  }

  const data: BevyApiResponse = await res.json();
  return data.results;
}

async function fetchAllEvents(identifier: string): Promise<FetchedEvent[]> {
  const { domain, chapterId } = parseSourceIdentifier(identifier);

  // Fetch both upcoming and past events
  const [live, completed] = await Promise.all([
    fetchBevyEvents(domain, chapterId, "Live"),
    fetchBevyEvents(domain, chapterId, "Completed"),
  ]);

  const seen = new Set<string>();
  const results: FetchedEvent[] = [];

  for (const ev of [...live, ...completed]) {
    if (!ev.title?.trim() || !ev.url) continue;

    // Deduplicate by URL
    if (seen.has(ev.url)) continue;
    seen.add(ev.url);

    // Extract a stable external ID from the URL slug
    const urlSlug = ev.url.replace(/\/$/, "").split("/").pop() || ev.title;
    const externalId = urlSlug;

    const { date: startDate, time: startTime } = parseToLocalDateAndTime(ev.start_date);
    if (!startDate) continue;

    const description = ev.description
      ? stripHtml(ev.description)
      : ev.description_short?.trim() ?? "";

    results.push({
      externalId,
      title: ev.title.trim(),
      description,
      location: "St. John's, NL",
      link: ev.url,
      organizer: "GDG St. John's",
      startDate,
      endDate: startDate,
      startTime,
      endTime: null,
      coverImageUrl: ev.cropped_picture_url ?? null,
      timezone: "America/St_Johns",
    });
  }

  return results;
}

export const bevyImporter: EventImporter = {
  sourceType: "bevy",

  async fetchEvents(config: ImportSourceConfig): Promise<FetchedEvent[]> {
    return fetchAllEvents(config.sourceIdentifier);
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    try {
      const { domain, chapterId } = parseSourceIdentifier(config.sourceIdentifier);
      const events = await fetchBevyEvents(domain, chapterId, "Live");
      const completed = await fetchBevyEvents(domain, chapterId, "Completed");
      return { valid: true, eventCount: events.length + completed.length };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Failed to reach Bevy API",
      };
    }
  },
};
