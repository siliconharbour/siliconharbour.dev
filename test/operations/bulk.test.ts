import { expect, it } from "vitest";
import { operationCatalog as ops } from "~/operations/catalog";
import { adminContext, publicContext } from "~/operations/context";
import { db } from "~/db";
import { importBlocklist } from "~/db/schema";

const ctx = adminContext(1);
it.each([
  [
    "jobBulkApprove",
    "jobBulkHide",
    "jobCreate",
    { title: "Developer", description: "Description", url: "https://example.com/job" },
  ],
  ["newsBulkApprove", "newsBulkHide", "newsArticleCreate", { title: "News", content: "Content" }],
  [
    "eventImportBulkApprove",
    "eventImportBulkHide",
    "eventCreate",
    {
      title: "Event",
      description: "Description",
      link: "https://example.com/event",
      dates: [{ startDate: "2026-11-01", startTime: "18:00" }],
    },
  ],
] as const)(
  "%s continues past missing records and validates before writing",
  async (approveName, hideName, createName, input) => {
    const first = await ops[createName].execute(ctx, input);
    const second = await ops[createName].execute(ctx, input);
    const read =
      createName === "jobCreate"
        ? ops.jobGet
        : createName === "newsArticleCreate"
          ? ops.newsGet
          : ops.eventGet;
    const statusField = createName === "eventCreate" ? "importStatus" : "status";
    const approvedStatus =
      createName === "jobCreate"
        ? "active"
        : createName === "newsArticleCreate"
          ? "published"
          : "approved";
    const results = await ops[approveName].execute(ctx, {
      ids: [first.id, 99999, second.id, first.id],
    });
    expect(results).toEqual([
      { id: first.id, ok: true },
      { id: 99999, ok: false, error: expect.stringContaining("not found") },
      { id: second.id, ok: true },
    ]);
    expect(await read.execute(ctx, { id: first.id })).toMatchObject({
      [statusField]: approvedStatus,
    });
    await expect(ops[hideName].execute(ctx, { ids: [first.id] })).rejects.toThrow("confirm");
    expect(await ops[hideName].execute(ctx, { ids: [first.id, second.id], confirm: true })).toEqual(
      [
        { id: first.id, ok: true },
        { id: second.id, ok: true },
      ],
    );
    expect(await read.execute(ctx, { id: second.id })).toMatchObject({ [statusField]: "hidden" });
    await expect(
      ops[approveName].execute(ctx, { ids: Array(201).fill(first.id) }),
    ).rejects.toThrow();
    await expect(ops[approveName].execute(publicContext(), { ids: [first.id] })).rejects.toThrow(
      "Administrator",
    );
  },
);
it("normalizes bulk block keys and upserts duplicates without duplicating rows", async () => {
  const result = await ops.blocklistAddMany.execute(ctx, {
    items: [
      { source: "github", externalId: "https://github.com/Example/", name: "Example" },
      { source: "github", externalId: "@EXAMPLE", name: "Example", reason: "Reviewed" },
    ],
    confirm: true,
  });
  expect(result).toEqual([
    { source: "github", key: "example", ok: true, deletedIds: [] },
    { source: "github", key: "example", ok: true, deletedIds: [] },
  ]);
  expect(
    await db
      .select({ key: importBlocklist.externalId, reason: importBlocklist.reason })
      .from(importBlocklist),
  ).toEqual([{ key: "example", reason: "Reviewed" }]);
});
