import { afterEach, expect, it, vi } from "vitest";
import { createNewsletterAuth } from "~/lib/newsletter-auth.server";
import { saveNewsletterCampaign, getNewsletterStats } from "~/lib/newsletter.server";

const config = {
  issuer: "https://auth.test",
  clientId: "client:id",
  clientSecret: "secret: with +",
  scope: "openid lists-fixture",
};
const discovery = {
  issuer: config.issuer,
  token_endpoint: `${config.issuer}/token`,
  grant_types_supported: ["client_credentials"],
  token_endpoint_auth_methods_supported: ["client_secret_basic"],
};
const issued = (value: string, extra = {}) => ({
  access_token: value,
  token_type: "Bearer",
  expires_in: 120,
  ...extra,
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("coalesces exchanges, uses Basic form encoding, and renews before expiry", async () => {
  let now = 0;
  let exchanges = 0;
  const requests: { url: string; init?: RequestInit }[] = [];
  const auth = createNewsletterAuth(
    config,
    async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      return Response.json(
        url.endsWith("openid-configuration") ? discovery : issued(`issued-${++exchanges}`),
      );
    },
    () => now,
  );
  expect(await Promise.all([auth.token(), auth.token(), auth.token()])).toEqual([
    "issued-1",
    "issued-1",
    "issued-1",
  ]);
  expect(exchanges).toBe(1);
  expect(requests[0].init?.headers).toBeUndefined();
  expect(requests[1].init?.headers).toMatchObject({
    Authorization: `Basic ${Buffer.from("client%3Aid:secret%3A+with+%2B").toString("base64")}`,
  });
  expect(new URLSearchParams(String(requests[1].init?.body)).get("grant_type")).toBe(
    "client_credentials",
  );
  expect(new URLSearchParams(String(requests[1].init?.body)).get("scope")).toBe(config.scope);
  expect(requests.every((request) => request.init?.redirect === "error")).toBe(true);
  now = 89999;
  expect(await auth.token()).toBe("issued-1");
  now = 90000;
  expect(await auth.token()).toBe("issued-2");
  auth.invalidate("issued-1");
  expect(await auth.token()).toBe("issued-2");
  auth.invalidate("issued-2");
  expect(await auth.token()).toBe("issued-3");
  expect(exchanges).toBe(3);
});

it("refuses untrusted discovery before sending the credential", async () => {
  for (const document of [
    { ...discovery, issuer: "https://other.test" },
    { ...discovery, token_endpoint: "https://other.test/token" },
    { ...discovery, token_endpoint: "https://user:secret@auth.test/token" },
    { ...discovery, grant_types_supported: ["authorization_code"] },
    { ...discovery, token_endpoint_auth_methods_supported: ["client_secret_post"] },
  ]) {
    const fetcher = vi.fn().mockResolvedValue(Response.json(document));
    await expect(createNewsletterAuth(config, fetcher).token()).rejects.toThrow(
      "Newsletter authorization failed",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
  }
  expect(() => createNewsletterAuth({ ...config, issuer: "http://auth.test" })).toThrow(
    "Newsletter authorization failed",
  );
  expect(() => createNewsletterAuth({ ...config, scope: "openid offline_access" })).toThrow(
    "Newsletter authorization failed",
  );
});

it("rejects invalid token grants and recovers on a later explicit request", async () => {
  for (const badToken of [
    issued("bad", { expires_in: 0 }),
    issued("bad", { scope: "openid" }),
    issued("bad", { scope: "openid lists-fixture admin" }),
    issued("bad", { refresh_token: "not-allowed" }),
    issued("bad", { token_type: "DPoP" }),
  ]) {
    let denied = true;
    const auth = createNewsletterAuth(config, async (input) =>
      Response.json(
        String(input).endsWith("openid-configuration")
          ? discovery
          : denied
            ? badToken
            : issued("accepted"),
      ),
    );
    await expect(auth.token()).rejects.toThrow("Newsletter authorization failed");
    denied = false;
    expect(await auth.token()).toBe("accepted");
  }
});

it("does not reuse an expiring token after an exchange outage or expose issuer details", async () => {
  let now = 0;
  let failed = false;
  const auth = createNewsletterAuth(
    config,
    async (input) => {
      if (String(input).endsWith("openid-configuration")) return Response.json(discovery);
      if (failed) return Response.json({ error: config.clientSecret }, { status: 503 });
      return Response.json(issued(`issued-at-${now}`));
    },
    () => now,
  );
  expect(await auth.token()).toBe("issued-at-0");
  now = 90000;
  failed = true;
  await expect(auth.token()).rejects.toThrow(/^Newsletter authorization failed$/);
  failed = false;
  expect(await auth.token()).toBe("issued-at-90000");
});

it("invalidates rejected access tokens without replaying a write, and reloads rotated credentials", async () => {
  vi.stubEnv("LISTS_API_URL", "https://lists.test");
  vi.stubEnv("LISTS_AUTH_ISSUER", config.issuer);
  vi.stubEnv("LISTS_AUTH_CLIENT_ID", "rotation-fixture");
  vi.stubEnv("LISTS_AUTH_CLIENT_SECRET", "first-fixture-secret");
  vi.stubEnv("LISTS_AUTH_SCOPE", config.scope);
  const resourceCalls: RequestInit[] = [];
  const exchangeHeaders: string[] = [];
  let denied = true;
  vi.stubGlobal("fetch", async (input: URL | string, init: RequestInit) => {
    const url = new URL(input);
    if (url.pathname.endsWith("openid-configuration")) return Response.json(discovery);
    if (url.origin === config.issuer) {
      exchangeHeaders.push((init.headers as Record<string, string>).Authorization);
      return Response.json(issued(`issued-${exchangeHeaders.length}`));
    }
    resourceCalls.push(init);
    return denied
      ? Response.json({ error: "must not echo credentials" }, { status: 401 })
      : Response.json({ data: { listId: 4, confirmed: 1, unconfirmed: 0, unsubscribed: 0 } });
  });
  await expect(
    saveNewsletterCampaign(4, { subject: "Fixture draft", bodyMarkdown: "Fixture" }),
  ).rejects.toThrow(/^Lists request failed \(401\)$/);
  expect(resourceCalls).toHaveLength(1);
  expect(resourceCalls[0].method).toBe("POST");
  denied = false;
  expect((await getNewsletterStats(4)).confirmed).toBe(1);
  expect(resourceCalls[1].headers).toMatchObject({ Authorization: "Bearer issued-2" });
  vi.stubEnv("LISTS_AUTH_CLIENT_SECRET", "replacement-fixture-secret");
  await getNewsletterStats(4);
  expect(exchangeHeaders).toHaveLength(3);
  expect(exchangeHeaders[2]).not.toBe(exchangeHeaders[1]);
});
