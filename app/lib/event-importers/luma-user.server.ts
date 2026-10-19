import type { EventImporter, ImportSourceConfig } from "./types";
import { createLumaSession, type LumaGet } from "./luma-http.server";
import { fetchLumaPages, mapLumaEvents, parseLumaPage } from "./luma-events.server";

async function loadUser(config: Omit<ImportSourceConfig, "id">, get: LumaGet) {
  let id = config.sourceIdentifier;
  if (!id.startsWith("usr-")) {
    const data = parseLumaPage(
      await get(`https://luma.com/user/${encodeURIComponent(id)}`, "text/html"),
    );
    const apiId = data?.user?.api_id;
    if (!apiId) throw new Error("Could not find Luma user ID");
    id = apiId;
  }
  return fetchLumaPages(get, "/user/profile/events-hosting", "user_api_id", id);
}

export const lumaUserImporter = {
  sourceType: "luma-user",
  async fetchEvents(config) {
    const get = createLumaSession();
    return {
      events: await mapLumaEvents(await loadUser(config, get), config, get),
      complete: true,
      futureOnly: true,
    };
  },
  async validateConfig(config) {
    try {
      const entries = await loadUser(config, createLumaSession());
      return { valid: true, eventCount: entries.length };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Failed to reach Luma",
      };
    }
  },
} satisfies EventImporter;
