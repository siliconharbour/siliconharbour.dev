import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNewsletterFlags,
  setNewsletterFlags,
  sendNewsletterTest,
} from "~/lib/newsletter.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("newsletter rollout", () => {
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
