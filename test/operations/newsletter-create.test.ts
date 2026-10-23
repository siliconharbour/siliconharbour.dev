import { afterEach, expect, it, vi } from "vitest";
import { operationCatalog as ops } from "~/operations/catalog";
import { adminContext } from "~/operations/context";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("reuses newsletter drafts and memberships without repeating writes or confirmations", async () => {
  vi.stubEnv("LISTS_API_URL", "https://lists.test");
  vi.stubEnv("LISTS_API_TOKEN", "test-token");
  const campaigns: Record<string, unknown>[] = [];
  const subscribers: Record<string, unknown>[] = [];
  const writes: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      let data: unknown;
      if (url.pathname === "/api/v1/lists")
        data = [
          {
            id: 2,
            name: "Harbour",
            slug: "siliconharbour",
            fromDomain: "siliconharbour.dev",
            fromAddress: "hello@siliconharbour.dev",
          },
        ];
      else if (url.pathname === "/api/v1/campaigns" && init?.method === "POST") {
        writes.push("campaign");
        data = {
          id: 1,
          ...body,
          audienceData: null,
          status: "draft",
          createdAt: new Date().toISOString(),
          sentAt: null,
          lastError: null,
        };
        campaigns.push(data as Record<string, unknown>);
      } else if (url.pathname === "/api/v1/campaigns") data = campaigns;
      else if (url.pathname === "/api/v1/subscribers" && init?.method === "POST") {
        writes.push("subscriber");
        expect(body.sendConfirmation).toBe(true);
        subscribers.push({
          id: 3,
          email: body.email,
          firstName: body.firstName ?? null,
          lastName: body.lastName ?? null,
          status: "active",
          membershipStatus: "unconfirmed",
          createdAt: new Date().toISOString(),
        });
        data = { id: 3, email: body.email };
      } else if (url.pathname === "/api/v1/subscribers") data = subscribers;
      else throw new Error(`Unexpected provider request: ${url}`);
      return Response.json({ data });
    }),
  );
  const ctx = adminContext(1);
  const input = { subject: "Newsletter", bodyMarkdown: "Community news", ifNotExists: true };
  const campaign = await ops.newsletterCampaignCreate.execute(ctx, input);
  expect(campaign.created).toBe(true);
  expect(await ops.newsletterCampaignCreate.execute(ctx, input)).toEqual({
    ...campaign,
    created: false,
  });
  const subscriberInput = { email: "Reader@Example.com", ifNotExists: true, confirm: true };
  const subscriber = await ops.newsletterSubscriberCreate.execute(ctx, subscriberInput);
  expect(subscriber).toEqual({ id: 3, email: "reader@example.com", created: true });
  expect(await ops.newsletterSubscriberCreate.execute(ctx, subscriberInput)).toEqual({
    ...subscriber,
    created: false,
  });
  expect(writes).toEqual(["campaign", "subscriber"]);
});
