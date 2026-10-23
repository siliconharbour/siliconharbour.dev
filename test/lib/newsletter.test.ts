import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNewsletterFlags,
  getNewsletterSends,
  setNewsletterFlags,
  sendNewsletterTest,
} from "~/lib/newsletter.server";
import { newsletterAudience } from "~/lib/newsletter-audience";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("newsletter rollout", () => {
  it("distinguishes a selected pilot audience from the full list", () => {
    expect(newsletterAudience({ audienceType: "list", audienceData: null })).toEqual({
      label: "Full list",
      testCount: null,
    });
    expect(
      newsletterAudience({ audienceType: "list", audienceData: '{"testSubscriberIds":[16,1980]}' }),
    ).toEqual({ label: "Pilot test · 2 selected", testCount: 2 });
  });

  it("reads actual campaign send records through Lists", async () => {
    vi.stubEnv("LISTS_API_URL", "http://lists.test:8080");
    vi.stubEnv("LISTS_API_TOKEN", "test-token");
    const fetchMock = vi.fn(
      async (_url: URL) =>
        new Response(
          JSON.stringify({
            data: [{ id: 5, subscriberId: 16, email: "pilot@example.com", status: "delivered" }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await getNewsletterSends(12, 50)).toMatchObject([
      { email: "pilot@example.com", status: "delivered" },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/v1/campaigns/12/sends?limit=50&offset=50",
    );
  });

  it("starts disabled and persists each setting", async () => {
    expect(await getNewsletterFlags()).toEqual({ publicSignup: false, liveSend: false });
    await setNewsletterFlags({ publicSignup: true, liveSend: false });
    expect(await getNewsletterFlags()).toEqual({ publicSignup: true, liveSend: false });
    await setNewsletterFlags({ publicSignup: false, liveSend: true });
    expect(await getNewsletterFlags()).toEqual({ publicSignup: false, liveSend: true });
  });

  it("sends a test only to confirmed addresses on the pilot allowlist", async () => {
    vi.stubEnv("LISTS_API_URL", "http://lists.test:8080");
    vi.stubEnv("LISTS_API_TOKEN", "test-token");
    vi.stubEnv("LISTS_PILOT_EMAILS", "pilot@example.com, pending@example.com");
    const calls: { path: string; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL, init?: RequestInit) => {
        const path = input.pathname + input.search;
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ path, body });
        let data: unknown;
        if (path === "/api/v1/campaigns/7") data = { id: 7, audienceType: "list", audienceId: 4 };
        else if (path.includes("search=pilot%40example.com"))
          data = [
            { id: 2, email: "pilot@example.com", status: "active", membershipStatus: "confirmed" },
          ];
        else if (path.includes("search=pending%40example.com"))
          data = [
            {
              id: 3,
              email: "pending@example.com",
              status: "active",
              membershipStatus: "unconfirmed",
            },
          ];
        else if (path === "/api/v1/campaigns/7/test-send") data = { id: 8 };
        else throw new Error(`Unexpected API path: ${path}`);
        return new Response(JSON.stringify({ data }), { status: 200 });
      }),
    );
    await sendNewsletterTest(7, 4);
    expect(calls.at(-1)).toEqual({
      path: "/api/v1/campaigns/7/test-send",
      body: { subscriberIds: [2], confirm: true },
    });
  });
});

it("returns honest provider pagination, including empty filtered campaign pages", async () => {
  vi.stubEnv("LISTS_API_URL", "https://lists.example.com");
  vi.stubEnv("LISTS_API_TOKEN", "test-token");
  const requests: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string) => {
      const url = new URL(input);
      requests.push(url);
      const offset = Number(url.searchParams.get("offset"));
      const data = url.pathname.endsWith("subscribers")
        ? offset === 0
          ? [{ id: 1 }, { id: 2 }, { id: 3 }]
          : [{ id: 3 }]
        : offset === 0
          ? [
              { id: 1, audienceType: "list", audienceId: 99, subject: "Other" },
              { id: 2, audienceType: "list", audienceId: 99, subject: "Other" },
              { id: 3, audienceType: "list", audienceId: 7, subject: "Community" },
            ]
          : [{ id: 3, audienceType: "list", audienceId: 7, subject: "Community" }];
      return new Response(JSON.stringify({ data }), { status: 200 });
    }),
  );
  const { listNewsletterSubscribers, listNewsletterCampaigns } =
    await import("~/lib/newsletter.server");
  const first = await listNewsletterSubscribers(7, { limit: 2, offset: 0, query: "person" });
  expect(first).toMatchObject({ items: [{ id: 1 }, { id: 2 }], total: null, nextOffset: 2 });
  expect(requests[0].searchParams.get("search")).toBe("person");
  expect(await listNewsletterSubscribers(7, { limit: 2, offset: first.nextOffset! })).toMatchObject(
    { items: [{ id: 3 }], total: null, nextOffset: null },
  );
  const empty = await listNewsletterCampaigns(7, { limit: 2, offset: 0 });
  expect(empty).toMatchObject({ items: [], total: null, nextOffset: 2 });
  expect(await listNewsletterCampaigns(7, { limit: 2, offset: empty.nextOffset! })).toMatchObject({
    items: [{ id: 3 }],
    total: null,
    nextOffset: null,
  });
});
