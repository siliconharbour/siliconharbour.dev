import { afterEach, expect, it, vi } from "vitest";
import { operationCatalog as operations } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { action as editEvent } from "~/routes/manage/events/edit";
import * as publicImages from "~/lib/public-image-fetch.server";
import * as importSync from "~/lib/event-importers/sync.server";
import { getDateInTimezone, formatInTimezone } from "~/lib/timezone";
import { Effect } from "effect";
import { createCodeMode } from "~/mcp/code-mode";
import { buildExecuteFunctions } from "~/mcp/bridge";
vi.mock("~/lib/session.server", () => ({
  requireAdmin: async () => ({ user: { id: 1, role: "admin" } }),
}));
afterEach(() => vi.restoreAllMocks());
const context = adminContext(1);
const basic = {
  title: "Meetup",
  description: "Description",
  link: "https://example.com",
  dates: [{ startDate: "2026-11-01", isAllDay: true }],
};
it("switches schedules while preserving occurrence overrides", async () => {
  const event = await operations.eventCreate.execute(context, basic);
  expect(event.importStatus).toBe("pending_review");
  expect(formatInTimezone(new Date(event.dates[0].startDate), "HH:mm")).toBe("12:00");
  await operations.eventUpdate.execute(context, {
    id: event.id,
    recurrenceRule: "FREQ=WEEKLY;BYDAY=SU",
    recurrenceStart: "2026-11-01",
    defaultStartTime: "18:00",
  });
  const override = await operations.eventOccurrenceCancel.execute(context, {
    id: event.id,
    date: "2026-11-08",
  });
  expect(override.cancelled).toBe(true);
  const recurring = await operations.eventGet.execute(context, { id: event.id });
  expect(recurring.dates).toEqual([]);
  expect(recurring.overrides).toHaveLength(1);
  await operations.eventUpdate.execute(context, { id: event.id, dates: basic.dates });
  const oneTime = await operations.eventGet.execute(context, { id: event.id });
  expect(oneTime).toMatchObject({
    recurrenceRule: null,
    recurrenceStart: null,
    recurrenceEnd: null,
    defaultStartTime: null,
    defaultEndTime: null,
  });
  expect(oneTime.overrides).toHaveLength(1);
  expect(getDateInTimezone(new Date(oneTime.dates[0].startDate))).toBe("2026-11-01");
  await expect(
    operations.eventUpdate.execute(context, {
      id: event.id,
      dates: basic.dates,
      recurrenceRule: "FREQ=WEEKLY;BYDAY=SU",
      defaultStartTime: "18:00",
    }),
  ).rejects.toThrow("Supply dates or recurrence fields");
  await expect(operations.eventUpdate.execute(context, { id: event.id })).rejects.toThrow(
    "No fields to update",
  );
});
it("produces the same recurrence switch through admin and MCP", async () => {
  const first = await operations.eventCreate.execute(context, basic);
  const second = await operations.eventCreate.execute(context, basic);
  const form = new FormData();
  for (const [key, value] of Object.entries({
    title: basic.title,
    description: basic.description,
    link: basic.link,
    eventType: "recurring",
    recurrenceRule: "FREQ=WEEKLY;BYDAY=SU",
    recurrenceStart: "2026-11-01",
    defaultStartTime: "18:00",
  }))
    form.set(key, value);
  await editEvent({
    request: new Request("https://example.com/manage", { method: "POST", body: form }),
    params: { id: String(first.id) },
  } as Parameters<typeof editEvent>[0]);
  const runtime = createCodeMode(buildExecuteFunctions(adminContext(1, "mcp")));
  const result = await Effect.runPromise(
    runtime.execute(
      `return await tools.siliconharbour.eventUpdate(${JSON.stringify({ id: second.id, recurrenceRule: "FREQ=WEEKLY;BYDAY=SU", recurrenceStart: "2026-11-01", defaultStartTime: "18:00" })});`,
    ),
  );
  expect(result.ok).toBe(true);
  const a = await operations.eventGet.execute(context, { id: first.id });
  const b = await operations.eventGet.execute(context, { id: second.id });
  for (const field of ["recurrenceRule", "recurrenceStart", "defaultStartTime", "dates"] as const)
    expect(a[field]).toEqual(b[field]);
});
it("approves using only the stored cover URL and tolerates a refused private target", async () => {
  const event = await operations.eventCreate.execute(context, {
    ...basic,
    coverImageUrl: "https://127.0.0.1/private.png",
  });
  const fetch = vi
    .spyOn(publicImages, "fetchPublicImage")
    .mockRejectedValue(new Error("Private address"));
  const result = await operations.eventImportApprove.execute(context, { id: event.id });
  expect(fetch).toHaveBeenCalledWith("https://127.0.0.1/private.png");
  expect(result).toEqual({ approved: true, coverPulled: false });
  expect((await operations.eventGet.execute(context, { id: event.id })).importStatus).toBe(
    "approved",
  );
  await expect(
    operations.eventImportApprove.execute(context, {
      id: event.id,
      coverImageUrl: "https://example.com/spoof.png",
    }),
  ).rejects.toThrow("coverImageUrl");
});
it("keeps approval distinct from public publication", async () => {
  const event = await operations.eventCreate.execute(context, basic);
  await operations.eventImportApprove.execute(context, { id: event.id });
  await operations.eventPublish.execute(context, { id: event.id });
  expect((await operations.eventGet.execute(context, { id: event.id })).importStatus).toBe(
    "published",
  );
  await operations.eventImportHide.execute(context, { id: event.id });
  expect((await operations.eventGet.execute(context, { id: event.id })).importStatus).toBe(
    "hidden",
  );
});
it("requires confirmation before any sync can reach the importer", async () => {
  const sync = vi
    .spyOn(importSync, "syncEvents")
    .mockResolvedValue({ success: true, added: 0, skipped: 0, removed: 0 });
  await expect(operations.eventSourceSync.execute(context, { id: 1 })).rejects.toThrow(
    "confirm: true",
  );
  expect(sync).not.toHaveBeenCalled();
});

it("deletes only unpublished source events and cleans up their images", async () => {
  const source = await importSync.createEventImportSource({
    name: "Source",
    organizer: null,
    sourceType: "meetup",
    sourceIdentifier: "example",
    sourceUrl: "https://www.meetup.com/example",
  });
  const pending = await operations.eventCreate.execute(context, basic);
  const published = await operations.eventCreate.execute(context, {
    ...basic,
    importStatus: "published",
  });
  const { updateEvent } = await import("~/lib/events.server");
  await updateEvent(pending.id, { importSourceId: source.id, coverImage: "pending-cover.webp" });
  await updateEvent(published.id, { importSourceId: source.id });
  const images = await import("~/lib/images.server");
  const remove = vi.spyOn(images, "deleteImage").mockResolvedValue();
  await operations.eventSourceDelete.execute(context, { id: source.id, confirm: true });
  await expect(operations.eventGet.execute(context, { id: pending.id })).rejects.toThrow(
    "Event not found",
  );
  expect(
    (await operations.eventGet.execute(context, { id: published.id })).importSourceId,
  ).toBeNull();
  expect(remove).toHaveBeenCalledWith("pending-cover.webp");
});
