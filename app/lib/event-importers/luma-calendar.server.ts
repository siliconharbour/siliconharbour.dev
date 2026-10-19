import type { EventImporter, ImportSourceConfig } from "./types";
import { createLumaSession, RateLimitedError, type LumaGet } from "./luma-http.server";
import { fetchLumaPages, mapLumaEvents, parseLumaPage, type LumaPage } from "./luma-events.server";

async function loadCalendar(config: Omit<ImportSourceConfig, "id">, get: LumaGet) {
  const identifier = config.sourceIdentifier;
  const url = identifier.startsWith("cal-") ? config.sourceUrl : `https://luma.com/${identifier}`;
  if (new URL(url).origin !== "https://luma.com")
    throw new Error("Expected a luma.com calendar URL");
  let apiId = identifier.startsWith("cal-") ? identifier : undefined;
  let upcoming: LumaPage | undefined;
  try {
    const data = parseLumaPage(await get(url, "text/html"));
    if (data?.kind && data.kind !== "calendar") throw new Error("Expected a Luma calendar page");
    apiId = data?.data?.calendar?.api_id ?? apiId;
    if (Array.isArray(data?.data?.upcoming?.entries)) upcoming = data.data.upcoming;
  } catch (error) {
    if (!apiId || error instanceof RateLimitedError) throw error;
  }
  if (upcoming && upcoming.has_more === false) return { entries: upcoming.entries, complete: true };
  if (!apiId) throw new Error("Could not find Luma calendar ID");
  try {
    return {
      entries: await fetchLumaPages(get, "/calendar/get-items", "calendar_api_id", apiId),
      complete: true,
    };
  } catch (error) {
    if (!(error instanceof RateLimitedError) || !upcoming) throw error;
    // A partial page can add events, but cannot prove that missing events were removed.
    return { entries: upcoming.entries, complete: false };
  }
}

export const lumaCalendarImporter = {
  sourceType: "luma-calendar",
  async fetchEvents(config) {
    const get = createLumaSession();
    const { entries, complete } = await loadCalendar(config, get);
    return {
      events: await mapLumaEvents(entries, config, get, complete),
      complete,
      futureOnly: true,
    };
  },
  async validateConfig(config) {
    try {
      const { entries } = await loadCalendar(config, createLumaSession());
      return { valid: true, eventCount: entries.length };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Failed to reach Luma",
      };
    }
  },
} satisfies EventImporter;
