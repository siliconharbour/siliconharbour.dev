import { afterEach, expect, it, vi } from "vitest";
import { operationCatalog as operations } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { db } from "~/db";
import { jobs } from "~/db/schema";
import { eq } from "drizzle-orm";
import { action as editNews } from "~/routes/manage/news/edit";
import { Effect } from "effect";
import { createCodeMode } from "~/mcp/code-mode";
import { buildExecuteFunctions } from "~/mcp/bridge";
import * as publicFetch from "~/lib/public-fetch.server";
vi.mock("~/lib/session.server", () => ({
  requireAdmin: async () => ({ user: { id: 1, role: "admin" } }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const context = adminContext(1);
it("blocks imported field edits while keeping lifecycle operations available", async () => {
  const job = await operations.jobCreate.execute(context, {
    title: "Developer",
    description: "Description",
    url: "https://example.com/job",
  });
  expect(operations.jobCreate.output.safeParse(job).success).toBe(true);
  await db.update(jobs).set({ sourceType: "imported" }).where(eq(jobs.id, job.id));
  await expect(
    operations.jobUpdate.execute(context, { id: job.id, title: "Changed" }),
  ).rejects.toThrow("Cannot edit imported jobs");
  await operations.jobHide.execute(context, { id: job.id });
  await operations.jobMarkNonTechnical.execute(context, { id: job.id });
  expect(await operations.jobGet.execute(context, { id: job.id })).toMatchObject({
    title: "Developer",
    status: "hidden",
    isTechnical: false,
  });
  await operations.jobDeactivate.execute(context, { id: job.id, reason: "filled" });
  const stored = await operations.jobGet.execute(context, { id: job.id });
  expect(stored.status).toBe("filled");
  expect(stored.removedAt).not.toBeNull();
});
it("updates a manual job's company and classification through the MCP operation", async () => {
  const company = await operations.companyCreate.execute(context, {
    name: "Company",
    description: "Description",
  });
  const job = await operations.jobCreate.execute(context, {
    title: "Developer",
    description: "Description",
    url: "https://example.com/job",
  });
  await buildExecuteFunctions(context).jobUpdate({
    id: job.id,
    companyId: company.id,
    isTechnical: false,
  });
  expect(await operations.jobGet.execute(context, { id: job.id })).toMatchObject({
    companyId: company.id,
    isTechnical: false,
  });
  await expect(operations.jobUpdate.execute(context, { id: job.id })).rejects.toThrow(
    "No fields to update",
  );
});
it("sets, preserves, and explicitly overrides a news publish date", async () => {
  const clock = { ...context, now: () => new Date("2026-11-01T18:00:00Z") };
  const article = await operations.newsArticleCreate.execute(clock, {
    title: "News",
    content: "Content",
  });
  expect(operations.newsArticleCreate.output.safeParse(article).success).toBe(true);
  const published = await operations.newsUpdate.execute(clock, {
    id: article.id,
    status: "published",
  });
  expect(published.publishedAt).toBe("2026-11-01T18:00:00.000Z");
  await operations.newsHide.execute(clock, { id: article.id });
  expect((await operations.newsGet.execute(clock, { id: article.id })).publishedAt).toBe(
    published.publishedAt,
  );
  const explicit = await operations.newsUpdate.execute(clock, {
    id: article.id,
    publishedAt: "2020-01-01T12:00:00Z",
    status: "published",
  });
  expect(explicit.publishedAt).toBe("2020-01-01T12:00:00.000Z");
  await expect(
    operations.newsUpdate.execute(clock, { id: article.id, content: " " }),
  ).rejects.toThrow("content is required");
  expect((await operations.newsGet.execute(clock, { id: article.id })).content).toBe("Content");
});
it("publishes identical news state through admin and MCP", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T18:00:00Z"));
  const first = await operations.newsArticleCreate.execute(context, {
    title: "First",
    content: "Content",
  });
  const second = await operations.newsArticleCreate.execute(context, {
    title: "Second",
    content: "Content",
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({
    title: "First",
    content: "New content",
    excerpt: "Excerpt",
    status: "published",
  }))
    form.set(key, value);
  await editNews({
    request: new Request("https://example.com/manage", { method: "POST", body: form }),
    params: { id: String(first.id) },
  } as Parameters<typeof editNews>[0]);
  const runtime = createCodeMode(buildExecuteFunctions(adminContext(1, "mcp")));
  const result = await Effect.runPromise(
    runtime.execute(
      `return await tools.siliconharbour.newsUpdate(${JSON.stringify({ id: second.id, title: "Second", content: "New content", excerpt: "Excerpt", status: "published" })});`,
    ),
  );
  expect(result.ok).toBe(true);
  const a = await operations.newsGet.execute(context, { id: first.id });
  const b = await operations.newsGet.execute(context, { id: second.id });
  for (const field of ["content", "excerpt", "status", "publishedAt"] as const)
    expect(a[field]).toEqual(b[field]);
});
it("fetches guarded link metadata and records the publication clock", async () => {
  const fetch = vi
    .spyOn(publicFetch, "fetchPublicPage")
    .mockResolvedValue(
      '<title>Local news</title><meta name="description" content="A community update">',
    );
  const clock = { ...context, now: () => new Date("2026-11-01T18:00:00Z") };
  const result = await operations.newsLinkSubmit.execute(clock, {
    url: "https://example.com/news",
    confirm: true,
  });
  expect(fetch).toHaveBeenCalledWith("https://example.com/news");
  expect(result).toMatchObject({
    title: "Local news",
    content: "A community update",
    status: "published",
    publishedAt: "2026-11-01T18:00:00.000Z",
  });
  expect(operations.newsLinkSubmit.output.safeParse(result).success).toBe(true);
});
it("passes feed previews through the public fetch guard before parsing", async () => {
  const fetch = vi.spyOn(publicFetch, "fetchPublicBytes").mockResolvedValue({
    bytes: Buffer.from(
      "<rss><channel><item><title>Local tech</title><link>https://example.com/post</link><description>News</description></item></channel></rss>",
    ),
    contentType: "application/rss+xml",
  });
  const result = await operations.newsSourceTestFeed.execute(context, {
    sourceUrl: "https://example.com/feed.xml",
    keywords: ["tech"],
    confirm: true,
  });
  expect(fetch).toHaveBeenCalledWith(
    "https://example.com/feed.xml",
    expect.objectContaining({ maxBytes: 4 * 1024 * 1024 }),
  );
  expect(result).toMatchObject({ totalCount: 1, matchedCount: 1, filteredCount: 0 });
  expect(operations.newsSourceTestFeed.output.safeParse(result).success).toBe(true);
  fetch.mockRejectedValue(
    new publicFetch.PublicFetchError("URL must resolve only to public addresses."),
  );
  await expect(
    operations.newsSourceTestFeed.execute(context, {
      sourceUrl: "https://127.0.0.1/feed",
      confirm: true,
    }),
  ).rejects.toThrow("public addresses");
});
