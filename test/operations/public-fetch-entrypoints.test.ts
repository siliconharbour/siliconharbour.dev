import { expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:https";
import type { ClientRequest } from "node:http";
import { operationCatalog as ops } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { db } from "~/db";
import { events } from "~/db/schema";

const dns = vi.hoisted(() => vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]));
vi.mock("node:dns/promises", () => ({ lookup: dns }));
vi.mock("node:https", () => ({
  get: (_url: URL, options: RequestOptions) => {
    const request = new EventEmitter();
    queueMicrotask(() =>
      options.lookup!("127.0.0.1.nip.io", { all: true }, (error) => {
        request.emit("error", error ?? new Error("Unexpected public DNS result"));
      }),
    );
    return request as ClientRequest;
  },
}));

it("rejects private DNS answers at news, feed and image entry points while still approving an import", async () => {
  const ctx = adminContext(1);
  const url = "https://127.0.0.1.nip.io/resource";
  await db.insert(events).values({
    id: 1,
    title: "Event",
    slug: "event",
    description: "Description",
    link: "https://example.com",
    importStatus: "pending_review",
    coverImageUrl: url,
  });
  await expect(ops.newsLinkSubmit.execute(ctx, { url, confirm: true })).rejects.toThrow(
    "public addresses",
  );
  await expect(
    ops.newsSourceTestFeed.execute(ctx, { sourceUrl: url, confirm: true }),
  ).rejects.toThrow("public addresses");
  await expect(
    ops.imageSetFromUrl.execute(ctx, { type: "event", id: 1, role: "cover", url, confirm: true }),
  ).rejects.toThrow("public addresses");
  const result = await ops.eventImportApprove.execute(ctx, { id: 1 });
  expect(result).toMatchObject({ coverPulled: false });
  expect(db.select().from(events).get()).toMatchObject({
    importStatus: "approved",
    coverImage: null,
  });
  expect(dns).toHaveBeenCalledTimes(4);
});
