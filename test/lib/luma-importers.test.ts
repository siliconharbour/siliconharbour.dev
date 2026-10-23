import * as publicNetwork from "~/lib/public-network-fetch.server";
import { db } from "~/db";
import { events } from "~/db/schema";
import { createEventImportSource, syncEvents } from "~/lib/event-importers/sync.server";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lumaCalendarImporter } from "~/lib/event-importers/luma-calendar.server";
import { lumaUserImporter } from "~/lib/event-importers/luma-user.server";
import { RateLimitedError } from "~/lib/event-importers/luma-http.server";
import type { ImportSourceConfig } from "~/lib/event-importers/types";

vi.mock("~/lib/event-importers/luma-http.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/event-importers/luma-http.server")>();
  let clock = 0;
  return {
    ...actual,
    createLumaSession: actual.createLumaHttp({
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      random: () => 0,
    }),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const html = readFileSync("test/fixtures/luma/calendar.html", "utf8");
const data = JSON.parse(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1]);
const entries = data.props.pageProps.initialData.data.upcoming.entries;
const config: ImportSourceConfig = {
  id: 1,
  organizer: null,
  sourceType: "luma-calendar",
  sourceIdentifier: "cal-test",
  sourceUrl: "https://luma.com/community",
  knownExternalIds: new Set(["evt-known"]),
};

function mockRequests(responses: Array<string | object | number>) {
  const request = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const response = responses.shift();
    if (response === undefined) throw new Error("Unexpected request");
    if (typeof response === "number") return new Response("limited", { status: response });
    return new Response(typeof response === "string" ? response : JSON.stringify(response));
  });
  vi.spyOn(publicNetwork, "publicFetch").mockImplementation(request);
  return request;
}

describe("Luma calendars", () => {
  it("uses the public page and skips details for known and past events", async () => {
    const request = mockRequests([html]);
    const result = await lumaCalendarImporter.fetchEvents(config);
    expect(result).toMatchObject({
      complete: true,
      futureOnly: true,
      events: [
        {
          externalId: "evt-known",
          description: "",
          startDate: "2099-11-20",
          endDate: "2099-11-21",
          startTime: "18:00",
          organizer: "Community",
        },
        { externalId: "evt-past", description: "" },
      ],
    });
    expect(request.mock.calls.map((call) => call[0])).toEqual(["https://luma.com/community"]);
  });

  it("fetches future pages through the API when the public data is missing", async () => {
    const request = mockRequests(["<html></html>", { entries, has_more: false }]);
    await expect(lumaCalendarImporter.fetchEvents(config)).resolves.toMatchObject({
      complete: true,
      events: expect.arrayContaining([expect.objectContaining({ externalId: "evt-known" })]),
    });
    const url = new URL(String(request.mock.calls[1][0]));
    expect(url.pathname).toBe("/calendar/get-items");
    expect(url.searchParams.get("period")).toBe("future");
  });

  it("imports a partial public page when the API is throttled without declaring missing events removed", async () => {
    const partial = html.replace(/"has_more":\s*false/, '"has_more":true');
    const request = mockRequests([partial, 429, 429, 429]);
    const source = await createEventImportSource({
      name: "Community",
      organizer: null,
      sourceType: "luma-calendar",
      sourceIdentifier: config.sourceIdentifier,
      sourceUrl: config.sourceUrl,
    });
    await expect(syncEvents(source.id)).resolves.toMatchObject({
      success: true,
      added: 2,
      removed: 0,
    });
    expect((await db.select().from(events)).map((event) => event.externalId)).toEqual([
      "evt-known",
      "evt-past",
    ]);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("reports rate limiting when no public page can be fetched", async () => {
    const request = mockRequests([429, 429, 429]);
    await expect(lumaCalendarImporter.fetchEvents(config)).rejects.toBeInstanceOf(RateLimitedError);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("fetches a new future event's description", async () => {
    const request = mockRequests([html, '<meta name="description" content="Come build things">']);
    await expect(
      lumaCalendarImporter.fetchEvents({ ...config, knownExternalIds: new Set() }),
    ).resolves.toMatchObject({
      events: [
        expect.objectContaining({ description: "Come build things" }),
        expect.objectContaining({ description: "" }),
      ],
    });
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "https://luma.com/community",
      "https://luma.com/community-meetup",
    ]);
  });
});

describe("Luma users", () => {
  it("paginates future events and deduplicates entries without fetching known descriptions", async () => {
    const request = mockRequests([
      { entries: [entries[0]], has_more: true, next_cursor: "next" },
      { entries, has_more: false },
    ]);
    const result = await lumaUserImporter.fetchEvents({
      ...config,
      sourceType: "luma-user",
      sourceIdentifier: "usr-test",
    });
    expect(result.events.map((event) => event.externalId)).toEqual(["evt-known", "evt-past"]);
    expect(request).toHaveBeenCalledTimes(2);
    const urls = request.mock.calls.map((call) => new URL(String(call[0])));
    expect(urls.map((url) => url.searchParams.get("period"))).toEqual(["future", "future"]);
    expect(urls[1].searchParams.get("pagination_cursor")).toBe("next");
  });

  it("resolves a profile slug before fetching hosted events", async () => {
    const profile =
      '<script id="__NEXT_DATA__">{"props":{"pageProps":{"initialData":{"user":{"api_id":"usr-test"}}}}}</script>';
    const request = mockRequests([profile, { entries: [], has_more: false }]);
    await lumaUserImporter.fetchEvents({
      ...config,
      sourceType: "luma-user",
      sourceIdentifier: "host",
    });
    expect(request.mock.calls[0][0]).toBe("https://luma.com/user/host");
    expect(new URL(String(request.mock.calls[1][0])).searchParams.get("user_api_id")).toBe(
      "usr-test",
    );
  });
});
