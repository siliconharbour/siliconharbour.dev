import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { Effect } from "effect";
import { db, rawDb } from "~/db";
import { events, people } from "~/db/schema";
import { DATA_DIR, IMAGES_DIR } from "~/lib/paths.server";
import { attachImage, setEntityImage } from "~/lib/entity-images.server";
import { prepareImageUpload, cleanupImageUploads } from "~/lib/mcp-image-uploads.server";
import * as downloader from "~/lib/public-image-fetch.server";
import { action } from "~/routes/api/mcp-uploads.$id";
import { buildExecuteFunctions } from "~/mcp/bridge";
import { createCodeMode, EXECUTE_LIMITS } from "~/mcp/code-mode";

vi.mock("~/lib/paths.server", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "mcp-image-test-"));
  return { DATA_DIR: root, IMAGES_DIR: join(root, "images"), DB_PATH: join(root, "unused.db") };
});
const origin = new URL("https://example.com");
let png: Buffer;
beforeEach(async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(IMAGES_DIR, { recursive: true });
  png = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  vi.spyOn(downloader, "fetchPublicImage").mockResolvedValue(png);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }));
function prepare(bytes = png) {
  return prepareImageUpload({ contentType: "image/png", size: bytes.length }, origin);
}
function request(
  slot: ReturnType<typeof prepare>,
  bytes = png,
  headers: Record<string, string> = {},
) {
  const merged = new Headers(slot.headers);
  for (const [key, value] of Object.entries(headers)) merged.set(key, value);
  return new Request(slot.uploadUrl, {
    method: "PUT",
    headers: merged,
    body: new Uint8Array(bytes),
  });
}
async function put(slot: ReturnType<typeof prepare>, req = request(slot)) {
  return action({ request: req, params: { id: slot.uploadId } } as Parameters<typeof action>[0]);
}
async function event() {
  return (
    await db
      .insert(events)
      .values({
        title: "Image test",
        slug: crypto.randomUUID(),
        description: "Test",
        link: "https://example.com",
        importStatus: "pending_review",
        coverImageUrl: "https://example.com/old.png",
      })
      .returning()
  )[0];
}

describe("MCP image workflows", () => {
  it("creates an event and attaches a URL cover in one Code Mode execution", async () => {
    const runtime = createCodeMode(buildExecuteFunctions(), EXECUTE_LIMITS);
    const result = await Effect.runPromise(
      runtime.execute(`
      const created = await tools.siliconharbour.createEntity({ type: "event", title: "Image workshop", description: "Build things", link: "https://example.com", startDate: "2026-11-20", startTime: "18:00" });
      return await tools.siliconharbour.setEntityImage({ type: "event", id: created.entity.id, role: "cover", url: "https://cdn.example.com/cover.png" });
    `),
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const row = await db.select().from(events).get();
    expect(row).toMatchObject({ importStatus: "pending_review", coverImageUrl: null });
    expect(row!.coverImage).toMatch(/^cover-.*\.webp$/);
    const image = await sharp(join(IMAGES_DIR, row!.coverImage!)).metadata();
    expect(image.format).toBe("webp");
    expect(image.width).toBeLessThanOrEqual(1200);
    expect(image.height).toBeLessThanOrEqual(630);
  });

  it("accepts raw PUT, crops icons, and permits exactly one concurrent attachment", async () => {
    const row = await event();
    const slot = prepare();
    expect(
      readFileSync(join(DATA_DIR, "mcp-uploads", slot.uploadId, "metadata.json"), "utf8"),
    ).not.toContain(slot.headers.Authorization.slice(7));
    expect((await put(slot)).status).toBe(200);
    expect((await put(slot)).status).toBe(409);
    const input = { type: "event", id: row.id, role: "icon", uploadId: slot.uploadId };
    const results = await Promise.allSettled([attachImage(input), attachImage(input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(readdirSync(join(DATA_DIR, "mcp-uploads"))).toEqual([]);
    const saved = rawDb.prepare("SELECT icon_image FROM events WHERE id=?").get(row.id) as {
      icon_image: string;
    };
    expect(await sharp(join(IMAGES_DIR, saved.icon_image)).metadata()).toMatchObject({
      width: 256,
      height: 256,
      format: "webp",
    });
    await expect(attachImage(input)).rejects.toThrow("not found or expired");
  });

  it("requires the upload-only token and matching type and size", async () => {
    const slot = prepare();
    expect(
      (await put(slot, request(slot, png, { Authorization: "Bearer not-a-token" }))).status,
    ).toBe(401);
    expect((await put(slot, request(slot, png, { "Content-Type": "image/jpeg" }))).status).toBe(
      415,
    );
    expect(
      (await put(slot, request(slot, png, { "Content-Length": String(png.length + 1) }))).status,
    ).toBe(413);
    expect((await put(slot)).status).toBe(200);
    expect((await put(slot, new Request(slot.uploadUrl, { method: "POST" }))).status).toBe(405);
  });

  it("rejects streamed overruns, short uploads, forged images and consumes failed attempts", async () => {
    for (const bytes of [
      Buffer.concat([png, Buffer.from([0])]),
      png.subarray(0, -1),
      Buffer.alloc(png.length),
    ]) {
      const slot = prepare();
      const response = await put(slot, request(slot, bytes));
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(existsSync(join(DATA_DIR, "mcp-uploads", slot.uploadId))).toBe(false);
      expect((await put(slot)).status).toBe(410);
    }
    expect(() => prepareImageUpload({ contentType: "image/svg+xml", size: 100 }, origin)).toThrow();
    expect(() =>
      prepareImageUpload({ contentType: "image/png", size: 5 * 1024 * 1024 + 1 }, origin),
    ).toThrow();
    await expect(
      attachImage({ type: "event", id: 1, role: "icon", uploadId: "../anything" }),
    ).rejects.toThrow();
  });

  it("expires unused slots, caps reservations, and reclaims capacity", () => {
    vi.useFakeTimers();
    const slots = Array.from({ length: 32 }, () => prepare());
    expect(() => prepare()).toThrow("slots are full");
    writeFileSync(
      join(DATA_DIR, "mcp-uploads", slots[0].uploadId, "metadata.json"),
      JSON.stringify({ expiresAt: Date.now() + 600_000 }),
    );
    cleanupImageUploads();
    expect(() => prepare()).not.toThrow();
    vi.setSystemTime(Date.now() + 600_001);
    cleanupImageUploads();
    expect(readdirSync(join(DATA_DIR, "mcp-uploads"))).toEqual([]);
    expect(() => prepare()).not.toThrow();
  });

  it("cancels and removes a stalled upload when its deadline expires", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const slot = prepare();
    const init: RequestInit & { duplex: "half" } = {
      method: "PUT",
      headers: slot.headers,
      body: new ReadableStream({ start() {} }),
      duplex: "half",
    };
    const response = put(slot, new Request(slot.uploadUrl, init));
    controller.abort();
    expect((await response).status).toBe(408);
    expect(existsSync(join(DATA_DIR, "mcp-uploads", slot.uploadId))).toBe(false);
  });

  it("validates targets before fetching or consuming an upload and maps avatar fields", async () => {
    const person = (
      await db
        .insert(people)
        .values({ name: "Image person", slug: "image-person", bio: "Test", visible: false })
        .returning()
    )[0];
    const slot = prepare();
    await put(slot);
    await expect(
      attachImage({ type: "person", id: person.id, role: "cover", uploadId: slot.uploadId }),
    ).rejects.toThrow("does not support");
    await expect(
      setEntityImage({ type: "event", id: 9999, role: "cover", url: "https://example.com/a.png" }),
    ).rejects.toThrow("not found");
    expect(downloader.fetchPublicImage).not.toHaveBeenCalled();
    const result = await attachImage({
      type: "person",
      id: person.id,
      role: "icon",
      uploadId: slot.uploadId,
    });
    expect(await db.select().from(people).get()).toMatchObject({
      avatar: result.filename,
      visible: false,
    });
  });

  it("keeps a referenced old file and deletes it once its last reference is replaced", async () => {
    const first = await event();
    const second = await event();
    const original = await setEntityImage({
      type: "event",
      id: first.id,
      role: "cover",
      url: "https://example.com/a.png",
    });
    rawDb.prepare("UPDATE events SET cover_image=? WHERE id=?").run(original.filename, second.id);
    await setEntityImage({
      type: "event",
      id: first.id,
      role: "cover",
      url: "https://example.com/b.png",
    });
    expect(existsSync(join(IMAGES_DIR, original.filename))).toBe(true);
    await setEntityImage({
      type: "event",
      id: second.id,
      role: "cover",
      url: "https://example.com/c.png",
    });
    expect(existsSync(join(IMAGES_DIR, original.filename))).toBe(false);
  });

  it("preserves replaced files referenced inside Markdown content", async () => {
    const row = await event();
    const original = await setEntityImage({
      type: "event",
      id: row.id,
      role: "cover",
      url: "https://example.com/a.png",
    });
    rawDb
      .prepare("UPDATE events SET description=? WHERE id=?")
      .run(`Embedded image: ![Cover](/images/${original.filename})`, row.id);
    await setEntityImage({
      type: "event",
      id: row.id,
      role: "cover",
      url: "https://example.com/b.png",
    });
    expect(existsSync(join(IMAGES_DIR, original.filename))).toBe(true);
  });

  it("removes a processed file if saving the row fails", async () => {
    const row = await event();
    const originalPrepare = rawDb.prepare.bind(rawDb);
    vi.spyOn(rawDb, "prepare").mockImplementation((sql) => {
      if (sql.startsWith("UPDATE `events`")) throw new Error("Write failed");
      return originalPrepare(sql);
    });
    await expect(
      setEntityImage({
        type: "event",
        id: row.id,
        role: "cover",
        url: "https://example.com/a.png",
      }),
    ).rejects.toThrow("Write failed");
    expect(readdirSync(IMAGES_DIR)).toEqual([]);
    expect((await db.select().from(events).get())!.coverImage).toBe(null);
  });
});
