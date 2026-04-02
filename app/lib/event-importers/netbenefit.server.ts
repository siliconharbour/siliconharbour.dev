/**
 * NetBenefit Software Event Importer
 * Scrapes https://www.netbenefitsoftware.com/events
 *
 * The page is SSR'd Webflow — events are in a `.collection-item.events` list with
 * `.blog-date`, `h5.events`, `p.paragraph`, and a link-wrapper anchor.
 */

import type { EventImporter, ImportSourceConfig, FetchedEvent, ValidationResult } from "./types";

const NETBENEFIT_EVENTS_URL = "https://www.netbenefitsoftware.com/events";

/** Parse "March 31, 2026" or "Mar 12 2026" style strings to "YYYY-MM-DD" */
function parseDateString(raw: string): string {
  try {
    const cleaned = raw.trim().replace(/\s+/g, " ");
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function fetchNetBenefitEvents(): Promise<FetchedEvent[]> {
  const res = await fetch(NETBENEFIT_EVENTS_URL);
  if (!res.ok) throw new Error(`Failed to fetch NetBenefit events page: ${res.status}`);
  const html = await res.text();

  // Split on each listitem div — one per event
  const blocks = html.split(/(?=<div[^>]*role="listitem"[^>]*class="[^"]*collection-item events)/);

  const fetched: FetchedEvent[] = [];

  for (const block of blocks.slice(1)) {

    // Date
    const dateMatch = block.match(/<div[^>]*class="[^"]*blog-date[^"]*"[^>]*>([^<]+)<\/div>/);
    if (!dateMatch) continue;
    const startDate = parseDateString(dateMatch[1].trim());
    if (!startDate) continue;

    // Title
    const titleMatch = block.match(/<h5[^>]*class="[^"]*events[^"]*"[^>]*>([^<]+)<\/h5>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1].trim());
    if (!title) continue;

    // Description
    const descMatch = block.match(/<p[^>]*class="[^"]*paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const description = descMatch
      ? decodeHtmlEntities(descMatch[1].replace(/<[^>]+>/g, "").trim())
      : "";

    // External link (Event Details href)
    const linkMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*link-wrapper[^"]*"/);
    const link = linkMatch ? linkMatch[1] : NETBENEFIT_EVENTS_URL;

    // Cover image
    const imgMatch = block.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*image-18[^"]*"/);
    const coverImageUrl = imgMatch ? imgMatch[1] : null;

    // Use link as externalId (stable per event); fall back to title+date combo
    const externalId = link !== NETBENEFIT_EVENTS_URL ? link : `${startDate}-${title}`;

    fetched.push({
      externalId,
      title,
      description,
      location: "St. John's, NL", // NetBenefit is NL-based; most events are local
      link,
      organizer: "NetBenefit Software",
      startDate,
      endDate: startDate,
      startTime: null,
      endTime: null,
      coverImageUrl,
      timezone: "America/St_Johns",
    });
  }

  return fetched;
}

export const netbenefitImporter: EventImporter = {
  sourceType: "netbenefit",

  async fetchEvents(_config: ImportSourceConfig): Promise<FetchedEvent[]> {
    return fetchNetBenefitEvents();
  },

  async validateConfig(_config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    try {
      const events = await fetchNetBenefitEvents();
      return { valid: true, eventCount: events.length };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Failed to fetch NetBenefit events",
      };
    }
  },
};
