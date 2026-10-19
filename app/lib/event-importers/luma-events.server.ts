import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import type { FetchedEvent, ImportSourceConfig } from "./types";
import { RateLimitedError, type LumaGet } from "./luma-http.server";

const lumaEntrySchema = z.object({
  api_id: z.string().optional(),
  event: z
    .object({
      api_id: z.string().optional(),
      name: z.string().optional(),
      start_at: z.string().optional(),
      end_at: z.string().optional(),
      cover_url: z.string().nullish(),
      location_type: z.string().nullish(),
      url: z.string().optional(),
      timezone: z.string().nullish(),
      geo_address_info: z
        .object({
          full_address: z.string().nullish(),
          city_state: z.string().nullish(),
          city: z.string().nullish(),
        })
        .nullish(),
    })
    .optional(),
  calendar: z.object({ name: z.string().optional() }).nullish(),
  hosts: z.array(z.object({ name: z.string().optional() })).optional(),
});

const lumaPageSchema = z.object({
  entries: z.array(lumaEntrySchema),
  has_more: z.boolean(),
  next_cursor: z.string().nullish(),
});

const initialDataSchema = z.object({
  kind: z.string().optional(),
  data: z
    .object({
      calendar: z.object({ api_id: z.string().optional() }).optional(),
      upcoming: lumaPageSchema.optional(),
    })
    .optional(),
  user: z.object({ api_id: z.string().optional() }).optional(),
});

type LumaEntry = z.infer<typeof lumaEntrySchema>;
export type LumaPage = z.infer<typeof lumaPageSchema>;

export function parseLumaPage(html: string) {
  const match = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!match) return undefined;
  const document = z.object({
    props: z.object({ pageProps: z.object({ initialData: initialDataSchema.optional() }) }),
  });
  return document.parse(JSON.parse(match[1])).props.pageProps.initialData;
}

export async function fetchLumaPages(
  get: LumaGet,
  path: string,
  idKey: string,
  id: string,
): Promise<LumaEntry[]> {
  const entries: LumaEntry[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ pagination_limit: "50", period: "future", [idKey]: id });
    if (cursor) params.set("pagination_cursor", cursor);
    const page = lumaPageSchema.parse(
      JSON.parse(await get(`https://api2.luma.com${path}?${params}`)),
    );
    entries.push(...page.entries);
    if (!page.has_more) break;
    if (!page.next_cursor || cursors.has(page.next_cursor))
      throw new Error("Luma returned incomplete pagination");
    cursor = page.next_cursor;
    cursors.add(cursor);
  } while (cursor);
  return entries;
}

export async function mapLumaEvents(
  entries: LumaEntry[],
  config: Omit<ImportSourceConfig, "id">,
  get: LumaGet,
  fetchDescriptions = true,
): Promise<FetchedEvent[]> {
  const results: FetchedEvent[] = [];
  const seen = new Set<string>();
  for (const { event: ev, calendar, hosts } of entries) {
    if (!ev?.api_id || !ev.name?.trim() || !ev.start_at || seen.has(ev.api_id)) continue;
    seen.add(ev.api_id);
    const timezone = ev.timezone ?? "America/St_Johns";
    const start = new Date(ev.start_at);
    const end = ev.end_at ? new Date(ev.end_at) : start;
    const link = new URL(ev.url ?? ev.api_id, "https://luma.com/");
    if (link.origin !== "https://luma.com") throw new Error("Unexpected Luma event URL");
    let description = "";
    if (
      fetchDescriptions &&
      !config.knownExternalIds?.has(ev.api_id) &&
      start.getTime() >= Date.now()
    ) {
      try {
        const html = await get(link.href, "text/html");
        const match =
          html.match(/<meta[^>]+name="description"[^>]+content="([^"]{0,2000})"/i) ??
          html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]{0,2000})"/i);
        description = match?.[1].trim() ?? "";
      } catch (error) {
        if (error instanceof RateLimitedError) throw error;
      }
    }
    const geo = ev.geo_address_info;
    results.push({
      externalId: ev.api_id,
      title: ev.name.trim(),
      description,
      location:
        geo?.full_address ??
        geo?.city_state ??
        geo?.city ??
        (ev.location_type === "online" ? "Online" : ""),
      link: link.href,
      organizer:
        (config.sourceType === "luma-calendar"
          ? (calendar?.name ?? hosts?.[0]?.name)
          : (hosts?.[0]?.name ?? calendar?.name)) ?? "Unknown",
      startDate: formatInTimeZone(start, timezone, "yyyy-MM-dd"),
      endDate: formatInTimeZone(end, timezone, "yyyy-MM-dd"),
      startTime: formatInTimeZone(start, timezone, "HH:mm"),
      endTime: ev.end_at ? formatInTimeZone(end, timezone, "HH:mm") : null,
      coverImageUrl: ev.cover_url ?? null,
      timezone,
    });
  }
  return results;
}
