import { describe, expect, it, vi } from "vitest";
import { createLumaHttp, RateLimitedError } from "~/lib/event-importers/luma-http.server";

function setup(responses: Array<Response | Error>, random = 0) {
  let clock = Date.parse("2026-11-20T12:00:00Z");
  const times: number[] = [];
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const request = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    times.push(clock);
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error("Unexpected request");
    return response;
  });
  const session = createLumaHttp({ fetch: request, now: () => clock, sleep, random: () => random });
  return { get: session(), session, request, sleep, times };
}

const url = "https://api2.luma.com/calendar/get-items?secret=not-in-errors";

describe("Luma HTTP", () => {
  it.each(["7", "Fri, 20 Nov 2026 12:00:07 GMT"])("honours Retry-After %s", async (retryAfter) => {
    const { get, times } = setup([
      new Response("limited", { status: 429, headers: { "Retry-After": retryAfter } }),
      new Response("ok"),
    ]);
    await expect(get(url)).resolves.toBe("ok");
    expect(times[1] - times[0]).toBe(7000);
  });

  it("caps retries, includes a bounded diagnostic, and stops the source session", async () => {
    const { get, request, times } = setup(
      Array.from({ length: 3 }, () => new Response("x".repeat(300), { status: 429 })),
      0.5,
    );
    await expect(get(url)).rejects.toMatchObject({
      status: 429,
      path: "/calendar/get-items",
      body: "x".repeat(200),
    });
    expect(times.map((time) => time - times[0])).toEqual([0, 5250, 20500]);
    await expect(get("https://luma.com/another")).rejects.toBeInstanceOf(RateLimitedError);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("does not wait beyond the source retry budget", async () => {
    const { get, request, times } = setup([
      new Response("limited", { status: 503, headers: { "Retry-After": "60" } }),
      new Response("limited", { status: 503, headers: { "Retry-After": "60" } }),
    ]);
    await expect(get(url)).rejects.toBeInstanceOf(RateLimitedError);
    expect(request).toHaveBeenCalledTimes(2);
    expect(times[1] - times[0]).toBe(60_000);
  });

  it.each([404, 401])("does not retry HTTP %s", async (status) => {
    const { get, request } = setup([new Response("missing", { status })]);
    await expect(get(url)).rejects.toThrow(`HTTP ${status} on /calendar/get-items: missing`);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([new Error("connection reset"), new Response("server error", { status: 500 })])(
    "retries transient failures once",
    async (failure) => {
      const second =
        failure instanceof Error
          ? new Error("connection reset")
          : new Response("server error", { status: 500 });
      const { get, request } = setup([failure, second]);
      await expect(get(url)).rejects.toThrow();
      expect(request).toHaveBeenCalledTimes(2);
    },
  );

  it("serializes requests across source sessions, spaces them, and identifies the site", async () => {
    let resolveFirst!: (response: Response) => void;
    let clock = 0;
    const starts: number[] = [];
    const request = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      starts.push(clock);
      return starts.length === 1
        ? new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          })
        : new Response("second");
    });
    const session = createLumaHttp({
      fetch: request,
      now: () => clock,
      random: () => 0,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    const first = session()(url);
    const second = session()("https://luma.com/calendar");
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    resolveFirst(new Response("first"));
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(starts).toEqual([0, 1000]);
    expect(new Headers(request.mock.calls[0][1]?.headers).get("User-Agent")).toContain(
      "siliconharbour.dev/1.0",
    );
  });
});
