import { afterEach, expect, it, vi } from "vitest";
import { operationCatalog as ops } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { db } from "~/db";
import { jobs } from "~/db/schema";
import { eq } from "drizzle-orm";
import { action as editJob } from "~/routes/manage/jobs/edit";
import { action as newJob } from "~/routes/manage/jobs/new";

vi.mock("~/lib/session.server", () => ({
  requireAdmin: async () => ({ user: { id: 1, role: "admin" } }),
}));
afterEach(() => vi.useRealTimers());
const ctx = adminContext(1);
const fields = { title: "Developer", description: "Description", url: "https://example.com/job" };
function request(postedAt: string) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ ...fields, postedAt })) form.set(key, value);
  return new Request("https://example.com/manage/jobs", { method: "POST", body: form });
}
it("defaults manual postings to now, accepts backdates and preserves omitted dates", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  const job = await ops.jobCreate.execute(ctx, fields);
  expect(job.postedAt).toBe("2026-10-15T12:00:00.000Z");
  const backdated = await ops.jobCreate.execute(ctx, {
    ...fields,
    url: "https://example.com/older",
    postedAt: "2026-09-01T12:00:00-02:30",
  });
  expect(backdated.postedAt).toBe("2026-09-01T14:30:00.000Z");
  expect((await ops.jobUpdate.execute(ctx, { id: backdated.id, title: "Renamed" })).postedAt).toBe(
    backdated.postedAt,
  );
  const updated = await ops.jobUpdate.execute(ctx, {
    id: job.id,
    postedAt: "2026-08-01T10:00:00Z",
  });
  expect(updated.postedAt).toBe("2026-08-01T10:00:00.000Z");
  expect((await ops.jobUpdate.execute(ctx, { id: job.id, postedAt: null })).postedAt).toBeNull();
});
it("converts Newfoundland form times to instants and lets admin clear a date", async () => {
  await newJob({ request: request("2026-10-15T12:00:30") } as Parameters<typeof newJob>[0]);
  const job = db.select().from(jobs).get()!;
  expect(job.postedAt?.toISOString()).toBe("2026-10-15T14:30:30.000Z");
  await editJob({
    request: request("2026-11-15T12:00:30"),
    params: { id: String(job.id) },
  } as Parameters<typeof editJob>[0]);
  expect(db.select().from(jobs).get()!.postedAt?.toISOString()).toBe("2026-11-15T15:30:30.000Z");
  await editJob({ request: request(""), params: { id: String(job.id) } } as Parameters<
    typeof editJob
  >[0]);
  expect(db.select().from(jobs).get()!.postedAt).toBeNull();
});
it("rejects invalid dates and field edits on imported jobs", async () => {
  const job = await ops.jobCreate.execute(ctx, fields);
  await expect(
    ops.jobUpdate.execute(ctx, { id: job.id, postedAt: "not a date" }),
  ).rejects.toThrow();
  const result = await editJob({
    request: request("not a date"),
    params: { id: String(job.id) },
  } as Parameters<typeof editJob>[0]);
  expect(result).toHaveProperty("error");
  expect(db.select().from(jobs).get()!.postedAt?.toISOString()).toBe(job.postedAt);
  await db.update(jobs).set({ sourceType: "imported" }).where(eq(jobs.id, job.id));
  await expect(ops.jobUpdate.execute(ctx, { id: job.id, postedAt: null })).rejects.toThrow(
    "Cannot edit imported jobs",
  );
});
