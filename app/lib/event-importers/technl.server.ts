/**
 * techNL Event Importer
 * Imports public events from techNL's NeonCRM Events portal.
 */

import type { EventImporter, ImportSourceConfig, FetchedEvent, ValidationResult } from "./types";

const CRM_BASE = "https://technl.app.neoncrm.com";
const NEON_EVENTS_BASE = "https://app.neononeevents.com";
const PORTAL_EVENTS_URL = `${CRM_BASE}/nx/portal/neonevents/events?path=%2Fportal%2Fevents`;
const JWT_CLIENT_ID = "UmgTSDs1g1";

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
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&[#\w]+;/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return decodeHtmlEntities(
    html
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*\/p\s*>/gi, "\n\n")
      .replace(/<\s*\/li\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function formatLocalDateTime(isoString: string, timezone: string): { date: string; time: string | null } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(isoString));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Request failed for ${url}: ${response.status}`);
  return response.json() as Promise<T>;
}

interface CrmTokenResponse {
  id_token?: string;
  error?: string;
}

interface NeonEventsPage {
  data: NeonEventSummary[];
  last_page: number;
}

interface NeonEventSummary {
  id: number;
}

interface NeonAddress {
  line_1?: string | null;
  line_2?: string | null;
  city?: string | null;
  state_province_iso?: string | null;
  postal_code?: string | null;
}

interface NeonLocation {
  name?: string | null;
  address?: NeonAddress | null;
}

interface NeonOccurrence {
  start_datetime?: string;
  end_datetime?: string;
}

interface NeonEventDetail {
  id: number;
  name?: string;
  description?: string | null;
  image?: string | null;
  location?: NeonLocation | null;
  occurrences?: NeonOccurrence[];
}

interface NeonPublicTokenResponse {
  entity?: {
    instance?: {
      timezone?: string;
      organization_profile?: {
        organization_name?: string;
      } | null;
    };
  };
}

async function getCrmJwt(): Promise<string> {
  const tokenResponse = await fetch(`${CRM_BASE}/jwt/token?client_id=${JWT_CLIENT_ID}`, {
    headers: { cookie: "orgId=technl", accept: "application/json" },
  });
  if (!tokenResponse.ok) throw new Error(`Failed to fetch techNL NeonCRM token: ${tokenResponse.status}`);

  const token = (await tokenResponse.json()) as CrmTokenResponse;
  if (!token.id_token) throw new Error(token.error ?? "techNL NeonCRM token response did not include id_token");

  return token.id_token;
}

function getNeonHeaders(jwt: string, refererPath = "/portal/events"): HeadersInit {
  return {
    authorization: `Bearer ${jwt}`,
    accept: "application/json",
    "x-requested-with": "XMLHttpRequest",
    referer: `${NEON_EVENTS_BASE}${refererPath}`,
    "user-agent": "Mozilla/5.0 (compatible; SiliconHarbour/1.0; +https://siliconharbour.dev)",
  };
}

function formatLocation(location: NeonLocation | null | undefined): string {
  if (!location) return "";
  const address = location.address;
  const addressText = address
    ? [address.line_1, address.line_2, address.city, address.state_province_iso, address.postal_code]
        .filter(Boolean)
        .join(", ")
    : "";
  return [location.name, addressText].filter(Boolean).join(" - ");
}

function mapEvent(detail: NeonEventDetail, timezone: string, organizer: string): FetchedEvent | null {
  const title = detail.name?.trim();
  const occurrence = detail.occurrences?.[0];
  if (!title || !occurrence?.start_datetime) return null;

  const start = formatLocalDateTime(occurrence.start_datetime, timezone);
  const end = occurrence.end_datetime
    ? formatLocalDateTime(occurrence.end_datetime, timezone)
    : { date: start.date, time: null };

  return {
    externalId: String(detail.id),
    title,
    description: htmlToText(detail.description),
    location: formatLocation(detail.location),
    link: `${PORTAL_EVENTS_URL}%2F${detail.id}`,
    organizer,
    startDate: start.date,
    endDate: end.date || start.date,
    startTime: start.time,
    endTime: end.time,
    coverImageUrl: detail.image ?? null,
    timezone,
  };
}

async function fetchTechNLEvents(): Promise<FetchedEvent[]> {
  const jwt = await getCrmJwt();
  const publicToken = await fetchJson<NeonPublicTokenResponse>(`${NEON_EVENTS_BASE}/api/portal/token-public`, {
    headers: getNeonHeaders(jwt),
  });

  const timezone = publicToken.entity?.instance?.timezone ?? "America/St_Johns";
  const organizer = publicToken.entity?.instance?.organization_profile?.organization_name ?? "techNL";
  const summaries: NeonEventSummary[] = [];

  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      "pagination[pageSize]": "50",
      "pagination[page]": String(page),
    });
    const pageData = await fetchJson<NeonEventsPage>(`${NEON_EVENTS_BASE}/api/portal/events?${params}`, {
      headers: getNeonHeaders(jwt),
    });

    summaries.push(...pageData.data);
    if (page >= pageData.last_page) break;
  }

  const events: FetchedEvent[] = [];
  for (const summary of summaries) {
    const detail = await fetchJson<NeonEventDetail>(
      `${NEON_EVENTS_BASE}/api/portal/event/${summary.id}?filter=upcoming&context=Portal`,
      { headers: getNeonHeaders(jwt, `/portal/events/${summary.id}`) },
    );
    const event = mapEvent(detail, timezone, organizer);
    if (event) events.push(event);
  }

  return events;
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
