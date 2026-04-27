/**
 * Meetup Event Importer
 *
 * Scrapes events from Meetup group pages via __NEXT_DATA__ → __APOLLO_STATE__.
 * Fetches both upcoming and past events pages to get a complete picture.
 *
 * sourceIdentifier is the group's URL name (e.g. "software-developers-of-st-johns")
 */

import type { EventImporter, ImportSourceConfig, FetchedEvent, ValidationResult } from "./types";

const MEETUP_BASE = "https://www.meetup.com";

interface MeetupApolloEvent {
  __typename: string;
  id: string;
  title: string;
  description: string;
  dateTime: string;
  endTime: string | null;
  eventUrl: string;
  eventType: string;
  isOnline: boolean;
  status: string;
  venue?: { __ref: string };
  featuredEventPhoto?: { __ref: string } | null;
  group?: { __ref: string };
}

interface MeetupApolloVenue {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
}

/**
 * Parse local date and time from a Meetup ISO string with offset.
 * e.g. "2026-03-28T12:00:00-02:30" → { date: "2026-03-28", time: "12:00" }
 * The time in the string is already local — we read it directly.
 */
function parseDateTime(isoString: string | undefined): { date: string; time: string | null } {
  if (!isoString) return { date: "", time: null };
  const match = isoString.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return { date: "", time: null };
  return { date: match[1], time: match[2] };
}

/**
 * Strip HTML tags for plain text.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Extract Apollo state events and venues from a Meetup page.
 */
async function fetchMeetupPage(
  groupUrlname: string,
  type: "upcoming" | "past",
): Promise<{ events: MeetupApolloEvent[]; venues: Record<string, MeetupApolloVenue> }> {
  const url =
    type === "upcoming"
      ? `${MEETUP_BASE}/${groupUrlname}/events/`
      : `${MEETUP_BASE}/${groupUrlname}/events/?type=past`;

  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 (compatible; SiliconHarbour/1.0; +https://siliconharbour.dev)",
    },
  });

  if (!res.ok) {
    throw new Error(`Meetup page error ${res.status} for group "${groupUrlname}"`);
  }

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("No __NEXT_DATA__ found on Meetup page");

  const data = JSON.parse(match[1]);
  const apollo: Record<string, unknown> =
    data?.props?.pageProps?.__APOLLO_STATE__ ?? {};

  const events: MeetupApolloEvent[] = [];
  const venues: Record<string, MeetupApolloVenue> = {};

  for (const [key, value] of Object.entries(apollo)) {
    if (
      key.startsWith("Event:") &&
      typeof value === "object" &&
      value !== null &&
      (value as Record<string, unknown>).__typename === "Event"
    ) {
      events.push(value as unknown as MeetupApolloEvent);
    }
    if (
      key.startsWith("Venue:") &&
      typeof value === "object" &&
      value !== null
    ) {
      venues[key] = value as unknown as MeetupApolloVenue;
    }
  }

  return { events, venues };
}

async function fetchAllMeetupEvents(groupUrlname: string): Promise<FetchedEvent[]> {
  const [upcoming, past] = await Promise.all([
    fetchMeetupPage(groupUrlname, "upcoming").catch(() => ({ events: [], venues: {} })),
    fetchMeetupPage(groupUrlname, "past").catch(() => ({ events: [], venues: {} })),
  ]);

  // Merge venues
  const allVenues = { ...past.venues, ...upcoming.venues };

  // Deduplicate events by ID
  const seen = new Set<string>();
  const allEvents: MeetupApolloEvent[] = [];
  for (const ev of [...upcoming.events, ...past.events]) {
    if (!seen.has(ev.id)) {
      seen.add(ev.id);
      allEvents.push(ev);
    }
  }

  const results: FetchedEvent[] = [];

  for (const ev of allEvents) {
    if (!ev.title?.trim()) continue;

    const { date: startDate, time: startTime } = parseDateTime(ev.dateTime);
    const { time: endTime } = parseDateTime(ev.endTime ?? undefined);
    if (!startDate) continue;

    // Resolve venue
    let location = "St. John's, NL";
    if (ev.isOnline) {
      location = "Online";
    } else if (ev.venue?.__ref && allVenues[ev.venue.__ref]) {
      const v = allVenues[ev.venue.__ref];
      const parts = [v.name, v.city, v.state?.toUpperCase()].filter(Boolean);
      location = parts.join(", ");
    }

    const description = ev.description ? stripHtml(ev.description).slice(0, 500) : "";

    results.push({
      externalId: ev.id,
      title: ev.title.trim(),
      description,
      location,
      link: ev.eventUrl || `${MEETUP_BASE}/${groupUrlname}/events/${ev.id}/`,
      organizer: groupUrlname,
      startDate,
      endDate: startDate,
      startTime,
      endTime,
      coverImageUrl: null, // Apollo refs are hard to resolve without another fetch
      timezone: "America/St_Johns",
    });
  }

  return results;
}

export const meetupImporter: EventImporter = {
  sourceType: "meetup",

  async fetchEvents(config: ImportSourceConfig): Promise<FetchedEvent[]> {
    return fetchAllMeetupEvents(config.sourceIdentifier);
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    try {
      const events = await fetchAllMeetupEvents(config.sourceIdentifier);
      return { valid: true, eventCount: events.length };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Failed to fetch Meetup events",
      };
    }
  },
};
