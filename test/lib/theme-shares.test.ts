import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { rawDb } from "~/db";
import {
  saveThemeShare,
  getThemeShare,
  listThemeShares,
  deleteThemeShare,
  themeShareLogo,
} from "~/lib/theme-shares.server";
import { DEFAULT_THEME } from "~/theme/tokens";
import { checkRateLimit } from "~/lib/ratelimit.server";
import { readThemeShareRequest } from "~/lib/theme-share-request.server";
import { requestIp, clientIpContext } from "~/lib/request-ip.server";
import { RouterContextProvider } from "react-router";
import { collectionSchema, draftContent, importShared } from "~/theme/drafts";

const input = { name: "Harbour green", theme: { ...DEFAULT_THEME, panelRadius: 12 }, logo: null };
async function responseStatus(work: Promise<unknown>, status: number) {
  try {
    await work;
    throw new Error("Expected failure");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(status);
  }
}
describe("theme shares", () => {
  it("keeps ownership secret, publishes updates with conflict detection, and deletes all share data", async () => {
    const created = await saveThemeShare(input, "192.0.2.1");
    expect(created.editKey).toMatch(/^[a-f0-9]{64}$/);
    const publicShare = getThemeShare(created.share.id);
    expect(publicShare).not.toHaveProperty("editKey");
    expect(publicShare).not.toHaveProperty("createdIp");
    const row = rawDb
      .prepare("SELECT edit_key_hash FROM theme_shares WHERE id=?")
      .get(publicShare.id) as { edit_key_hash: string };
    expect(row.edit_key_hash).not.toBe(created.editKey);
    await responseStatus(
      saveThemeShare({ ...input, revision: 1 }, "192.0.2.2", {
        id: publicShare.id,
        key: "0".repeat(64),
      }),
      403,
    );
    const updated = await saveThemeShare({ ...input, name: "Edited", revision: 1 }, "192.0.2.3", {
      id: publicShare.id,
      key: created.editKey!,
    });
    expect(updated).not.toHaveProperty("editKey");
    expect(updated.share.revision).toBe(2);
    await responseStatus(
      saveThemeShare({ ...input, revision: 1 }, "192.0.2.3", {
        id: publicShare.id,
        key: created.editKey!,
      }),
      409,
    );
    expect(listThemeShares().items[0]).toMatchObject({
      createdIp: "192.0.2.1",
      updatedIp: "192.0.2.3",
      revision: 2,
    });
    expect(deleteThemeShare(publicShare.id).deleted).toBe(true);
    expect(() => getThemeShare(publicShare.id)).toThrow();
  });
  it("stores only validated PNGs and returns actual image dimensions", async () => {
    const bytes = await sharp({ create: { width: 32, height: 16, channels: 4, background: "red" } })
      .png()
      .toBuffer();
    const logo = {
      src: `data:image/png;base64,${bytes.toString("base64")}`,
      name: "Logo",
      hash: "0".repeat(64),
      width: 32,
      height: 16,
    };
    const created = await saveThemeShare({ ...input, logo }, "192.0.2.1");
    expect(created.share.logo).toMatchObject({ width: 32, height: 16 });
    expect((await sharp(themeShareLogo(created.share.id)!).metadata()).format).toBe("png");
    await responseStatus(
      saveThemeShare(
        {
          ...input,
          logo: {
            ...logo,
            src: `data:image/png;base64,${Buffer.from('<svg><image href="http://169.254.169.254"/></svg>').toString("base64")}`,
          },
        },
        "192.0.2.1",
      ),
      400,
    );
    const oversized = await sharp({
      create: { width: 1025, height: 1, channels: 4, background: "red" },
    })
      .png()
      .toBuffer();
    await responseStatus(
      saveThemeShare(
        {
          ...input,
          logo: { ...logo, src: `data:image/png;base64,${oversized.toString("base64")}` },
        },
        "192.0.2.1",
      ),
      400,
    );
  });
  it("enforces a global storage bound even when per-IP limits are avoided", async () => {
    await saveThemeShare(input, "192.0.2.1");
    rawDb.prepare("UPDATE theme_shares SET logo_bytes=?").run(200 * 1024 * 1024 + 1);
    await responseStatus(saveThemeShare(input, "192.0.2.2"), 507);
  });
});
describe("upload boundaries", () => {
  it("makes rate-limit increments atomic under simultaneous requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => checkRateLimit("parallel", 5, 600)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(
      (
        rawDb.prepare("SELECT count FROM rate_limits WHERE key='parallel'").get() as {
          count: number;
        }
      ).count,
    ).toBe(5);
  });
  it("counts rejected attempts, checks origin and bounds request bytes", async () => {
    const request = () =>
      new Request("https://example.com/api/theme-shares", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: "not json",
      });
    for (let i = 0; i < 5; i++)
      await responseStatus(readThemeShareRequest(request(), "192.0.2.1"), 400);
    await responseStatus(readThemeShareRequest(request(), "192.0.2.1"), 429);
    await responseStatus(
      readThemeShareRequest(
        new Request("https://example.com/api/theme-shares", {
          method: "POST",
          headers: { origin: "https://elsewhere.com" },
          body: "{}",
        }),
        "192.0.2.2",
      ),
      403,
    );
    await responseStatus(
      readThemeShareRequest(
        new Request("https://example.com/api/theme-shares", {
          method: "POST",
          headers: { origin: "https://example.com", "content-type": "application/json" },
          body: "x".repeat(768 * 1024 + 1),
        }),
        "192.0.2.2",
      ),
      413,
    );
    const context = new RouterContextProvider();
    context.set(clientIpContext, "::ffff:192.0.2.3");
    expect(requestIp(context)).toBe("192.0.2.3");
  });
});
describe("local collections", () => {
  it("preserves local ownership and edits when reopening one's own share", async () => {
    const created = await saveThemeShare(input, "192.0.2.1");
    const owned = {
      id: "mine",
      ...input,
      name: "Unpublished",
      shareId: created.share.id,
      editKey: created.editKey!,
      revision: 1,
    };
    const collection = collectionSchema.parse({ version: 1, active: "mine", items: [owned] });
    expect(importShared(collection, created.share).items).toEqual([owned]);
    const imported = importShared(
      { ...collection, items: [{ ...owned, shareId: undefined, editKey: undefined }] },
      created.share,
    );
    expect(imported.items).toHaveLength(2);
    expect(imported.items[1]).not.toHaveProperty("editKey");
    expect(draftContent(owned)).not.toContain(created.editKey!);
  });
});
