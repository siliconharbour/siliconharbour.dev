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
    expect(newsletterAudience({ audienceType: "list", audienceData: null })).toEqual({ label: "Full list", testCount: null });
    expect(newsletterAudience({ audienceType: "list", audienceData: '{"testSubscriberIds":[16,1980]}' })).toEqual({ label: "Pilot test · 2 selected", testCount: 2 });
  });

  it("reads actual campaign send records through Lists", async () => {
    vi.stubEnv("LISTS_API_URL", "http://lists.test:8080");
    vi.stubEnv("LISTS_API_TOKEN", "test-token");
    const fetchMock = vi.fn(async (_url: URL) => new Response(JSON.stringify({ data: [{ id: 5, subscriberId: 16, email: "pilot@example.com", status: "delivered" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getNewsletterSends(12, 50)).toMatchObject([{ email: "pilot@example.com", status: "delivered" }]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/campaigns/12/sends?limit=50&offset=50");
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
    vi.stubGlobal("fetch", vi.fn(async (input: URL, init?: RequestInit) => {
      const path = input.pathname + input.search;
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, body });
      let data: unknown;
      if (path === "/api/v1/campaigns/7") data = { id: 7, audienceType: "list", audienceId: 4 };
      else if (path.includes("search=pilot%40example.com")) data = [{ id: 2, email: "pilot@example.com", status: "active", membershipStatus: "confirmed" }];
      else if (path.includes("search=pending%40example.com")) data = [{ id: 3, email: "pending@example.com", status: "active", membershipStatus: "unconfirmed" }];
      else if (path === "/api/v1/campaigns/7/test-send") data = { id: 8 };
      else throw new Error(`Unexpected API path: ${path}`);
      return new Response(JSON.stringify({ data }), { status: 200 });
    }));
    await sendNewsletterTest(7, 4);
    expect(calls.at(-1)).toEqual({ path: "/api/v1/campaigns/7/test-send", body: { subscriberIds: [2], confirm: true } });
  });
});
