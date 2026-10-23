import { expect, it } from "vitest";
import { operationCatalog as operations } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { db } from "~/db";
import { newsImportSources } from "~/db/schema";

it("round-trips keyword arrays through source storage and global configuration", async () => {
  const context = adminContext(1);
  const source = await operations.newsSourceCreate.execute(context, {
    name: "Feed",
    sourceType: "rss",
    sourceUrl: "https://example.com/feed",
    keywords: ["  local tech  ", "jobs"],
  });
  expect(source.keywords).toEqual(["local tech", "jobs"]);
  expect((await db.select().from(newsImportSources).get())?.keywords).toEqual(source.keywords);
  await operations.newsGlobalKeywordsSet.execute(context, { keywords: ["community"] });
  expect(await operations.newsGlobalKeywordsGet.execute(context, {})).toEqual(["community"]);
  await expect(
    operations.newsSourceUpdate.execute(context, { id: source.id, keywords: ["one,two"] }),
  ).rejects.toThrow("comma");
});

it("rejects a malformed manual job rather than silently discarding it", async () => {
  const input = operations.jobSourceManualSync.input;
  expect(
    input.safeParse({
      id: 3,
      jobs: [
        {
          externalId: "job",
          title: "Developer",
          url: "https://example.com/job",
          postedAt: "not a date",
        },
      ],
    }).success,
  ).toBe(false);
  expect(
    input.safeParse({
      id: 3,
      jobs: [
        { externalId: "job", title: "Developer", url: "https://example.com/job", unknown: true },
      ],
    }).success,
  ).toBe(false);
  expect(input.safeParse({ id: 3, jobs: [] }).success).toBe(false);
});
