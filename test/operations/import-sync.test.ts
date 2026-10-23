import { afterEach, expect, it, vi } from "vitest";
import { db } from "~/db";
import { companies, eventImportSources, jobImportSources, newsImportSources } from "~/db/schema";
import { operationCatalog } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import * as asyncSyncs from "~/lib/async-syncs.server";
import * as events from "~/lib/event-importers/sync.server";
import * as jobs from "~/lib/job-importers/sync.server";
import * as news from "~/lib/news-importers/sync.server";

afterEach(() => vi.restoreAllMocks());
it("queues selected source types once in shared event ordering, then jobs and news", async () => {
  const [company] = await db
    .insert(companies)
    .values({ name: "Employer", slug: "employer", description: "Description" })
    .returning();
  await db.insert(eventImportSources).values([
    {
      name: "Other",
      sourceType: "meetup",
      sourceIdentifier: "other",
      sourceUrl: "https://example.com/other",
    },
    {
      name: "Luma",
      sourceType: "luma-calendar",
      sourceIdentifier: "luma",
      sourceUrl: "https://example.com/luma",
    },
  ]);
  await db
    .insert(jobImportSources)
    .values({ companyId: company.id, sourceType: "greenhouse", sourceIdentifier: "employer" });
  await db
    .insert(newsImportSources)
    .values({ name: "News", sourceType: "rss", sourceUrl: "https://example.com/feed" });
  const start = vi.spyOn(asyncSyncs, "startAsyncSync").mockReturnValue({
    id: "run",
    startedBy: 1,
    via: "admin-ui",
    error: undefined,
    status: "running",
    finishedAt: undefined,
    durationMs: undefined,
    current: undefined,
    startedAt: new Date().toISOString(),
    steps: [],
    total: 4,
    completed: 0,
    failed: 0,
  });
  const event = vi.spyOn(events, "syncEvents").mockRejectedValue(new Error("mocked"));
  const job = vi.spyOn(jobs, "syncJobs").mockRejectedValue(new Error("mocked"));
  const article = vi.spyOn(news, "syncNewsSource").mockRejectedValue(new Error("mocked"));
  await operationCatalog.importSyncAll.execute(adminContext(1), { confirm: true });
  const tasks = start.mock.calls[0][0];
  expect(tasks.map(({ type, name }) => [type, name])).toEqual([
    ["event", "Luma"],
    ["event", "Other"],
    ["job", "Employer"],
    ["news", "News"],
  ]);
  for (const task of tasks) await expect(task.run()).rejects.toThrow("mocked");
  expect(event).toHaveBeenCalledTimes(2);
  expect(job).toHaveBeenCalledOnce();
  expect(article).toHaveBeenCalledOnce();
  await operationCatalog.importSyncAll.execute(adminContext(1), { types: ["news"], confirm: true });
  expect(start.mock.calls[1][0].map((task) => task.type)).toEqual(["news"]);
});
