import { expect, it, vi, afterEach } from "vitest";
import { db } from "~/db";
import { companies, eventImportSources, jobImportSources, newsImportSources } from "~/db/schema";
import { syncEvents } from "~/lib/event-importers/sync.server";
import { syncJobs, syncJobsFromFetched } from "~/lib/job-importers/sync.server";
import { syncNewsSource } from "~/lib/news-importers/sync.server";
import { getEventImporter } from "~/lib/event-importers";
import { getImporter } from "~/lib/job-importers";
import { getNewsImporter } from "~/lib/news-importers";
vi.mock("~/lib/event-importers", () => ({ getEventImporter: vi.fn() }));
vi.mock("~/lib/job-importers", () => ({ getImporter: vi.fn() }));
vi.mock("~/lib/news-importers", () => ({ getNewsImporter: vi.fn() }));
afterEach(() => vi.resetAllMocks());
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it("keeps source results during execution, rejects overlap and releases failed executions", async () => {
  const [source] = await db
    .insert(eventImportSources)
    .values({
      name: "Events",
      sourceType: "meetup",
      sourceIdentifier: "group",
      sourceUrl: "https://example.com",
      fetchStatus: "success",
    })
    .returning();
  const pending = deferred<[]>();
  const fetchEvents = vi.fn(() => pending.promise);
  vi.mocked(getEventImporter).mockReturnValue({ fetchEvents } as never);
  const run = syncEvents(source.id);
  await vi.waitFor(() => expect(fetchEvents).toHaveBeenCalledOnce());
  expect((await db.select().from(eventImportSources))[0].fetchStatus).toBe("success");
  await expect(syncEvents(source.id)).rejects.toThrow("already in progress");
  pending.resolve([]);
  expect((await run).success).toBe(true);
  fetchEvents.mockRejectedValueOnce(new Error("network failed"));
  expect(await syncEvents(source.id)).toMatchObject({ success: false, error: "network failed" });
  expect((await syncEvents(source.id)).success).toBe(true);
});
it("uses the same job source lock for fetched snapshots and live syncs", async () => {
  const [company] = await db
    .insert(companies)
    .values({ name: "Company", slug: "company", description: "Employer" })
    .returning();
  const [source] = await db
    .insert(jobImportSources)
    .values({
      companyId: company.id,
      sourceType: "greenhouse",
      sourceIdentifier: "company",
      fetchStatus: "success",
    })
    .returning();
  const pending = deferred<[]>();
  const fetchJobs = vi.fn(() => pending.promise);
  vi.mocked(getImporter).mockReturnValue({ fetchJobs } as never);
  const run = syncJobs(source.id);
  await vi.waitFor(() => expect(fetchJobs).toHaveBeenCalledOnce());
  await expect(syncJobsFromFetched(source.id, [])).rejects.toThrow("already in progress");
  expect((await db.select().from(jobImportSources))[0].fetchStatus).toBe("success");
  pending.resolve([]);
  expect((await run).success).toBe(true);
  expect((await syncJobsFromFetched(source.id, [])).success).toBe(true);
});
it("keeps news last-result metadata until completion and excludes overlapping fetches", async () => {
  const [source] = await db
    .insert(newsImportSources)
    .values({
      name: "News",
      sourceType: "rss",
      sourceUrl: "https://example.com/rss",
      lastSyncStatus: "success",
    })
    .returning();
  const pending = deferred<[]>();
  const fetchItems = vi.fn(() => pending.promise);
  vi.mocked(getNewsImporter).mockReturnValue({ fetchItems } as never);
  const run = syncNewsSource(source.id);
  await vi.waitFor(() => expect(fetchItems).toHaveBeenCalledOnce());
  expect((await db.select().from(newsImportSources))[0].lastSyncStatus).toBe("success");
  await expect(syncNewsSource(source.id)).rejects.toThrow("already in progress");
  pending.resolve([]);
  expect((await run).success).toBe(true);
});
