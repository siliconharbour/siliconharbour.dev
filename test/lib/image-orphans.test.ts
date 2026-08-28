import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteAllStagedOrphans,
  deleteStagedOrphan,
  stageOrphanedImagesBatch,
  type StagedOrphan,
} from "~/lib/image-orphans.server";

const tempDirs: string[] = [];

function createFixture(entries: Array<{ name: string; referenced?: boolean }>) {
  const root = mkdtempSync(join(tmpdir(), "siliconharbour-orphans-"));
  tempDirs.push(root);
  const imagesDir = join(root, "images");
  const stageDir = join(root, "orphaned-images");
  const dbPath = join(root, "test.db");
  mkdirSync(imagesDir);
  mkdirSync(stageDir);

  const db = new Database(dbPath);
  db.exec("CREATE TABLE content (image TEXT)");
  const staged: StagedOrphan[] = entries.map((entry) => {
    writeFileSync(join(imagesDir, entry.name), "image");
    if (entry.referenced) db.prepare("INSERT INTO content (image) VALUES (?)").run(entry.name);
    return {
      path: entry.name,
      filename: entry.name,
      sizeBytes: 5,
      stagedAt: new Date().toISOString(),
      reason: "test",
    };
  });
  db.close();
  writeFileSync(join(stageDir, "staged.json"), JSON.stringify(staged));
  return { imagesDir, stageDir, dbPath };
}

function createScanFixture() {
  const root = mkdtempSync(join(tmpdir(), "siliconharbour-orphan-scan-"));
  tempDirs.push(root);
  const imagesDir = join(root, "images");
  const stageDir = join(root, "orphaned-images");
  const dbPath = join(root, "test.db");
  mkdirSync(imagesDir);

  const db = new Database(dbPath);
  db.exec("CREATE TABLE content (image TEXT, body TEXT)");
  db.close();
  return { imagesDir, stageDir, dbPath };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("orphaned image deletion", () => {
  it("deletes an unreferenced file and removes it from staging", () => {
    const fixture = createFixture([{ name: "orphan.webp" }]);
    const result = deleteStagedOrphan("orphan.webp", fixture);

    expect(result.deletedCount).toBe(1);
    expect(existsSync(join(fixture.imagesDir, "orphan.webp"))).toBe(false);
    expect(JSON.parse(readFileSync(join(fixture.stageDir, "staged.json"), "utf8"))).toEqual([]);
  });

  it("preserves a candidate that is now referenced", () => {
    const fixture = createFixture([{ name: "used.webp", referenced: true }]);
    const result = deleteStagedOrphan("used.webp", fixture);

    expect(result.referencedCount).toBe(1);
    expect(existsSync(join(fixture.imagesDir, "used.webp"))).toBe(true);
    expect(JSON.parse(readFileSync(join(fixture.stageDir, "staged.json"), "utf8"))).toHaveLength(1);
  });

  it("re-checks every candidate during bulk deletion", () => {
    const fixture = createFixture([
      { name: "orphan.webp" },
      { name: "used.webp", referenced: true },
    ]);
    const result = deleteAllStagedOrphans(fixture);

    expect(result).toMatchObject({ deletedCount: 1, referencedCount: 1, remainingStagedCount: 1 });
    expect(existsSync(join(fixture.imagesDir, "orphan.webp"))).toBe(false);
    expect(existsSync(join(fixture.imagesDir, "used.webp"))).toBe(true);
  });

  it("keeps unsafe paths staged without touching files outside the image directory", () => {
    const fixture = createFixture([{ name: "orphan.webp" }]);
    const stagedPath = join(fixture.stageDir, "staged.json");
    const [entry] = JSON.parse(readFileSync(stagedPath, "utf8")) as StagedOrphan[];
    entry.path = "../outside.webp";
    writeFileSync(stagedPath, JSON.stringify([entry]));

    const result = deleteAllStagedOrphans(fixture);

    expect(result).toMatchObject({ deletedCount: 0, failedCount: 1, remainingStagedCount: 1 });
  });
});

describe("orphaned image scanning", () => {
  it("finds references stored as filenames, relative paths, and public image URLs", async () => {
    const fixture = createScanFixture();
    mkdirSync(join(fixture.imagesDir, "nested"));
    writeFileSync(join(fixture.imagesDir, "filename.webp"), "image");
    writeFileSync(join(fixture.imagesDir, "nested", "relative.png"), "image");
    writeFileSync(join(fixture.imagesDir, "public.jpg"), "image");
    writeFileSync(join(fixture.imagesDir, "orphan.avif"), "image");
    const db = new Database(fixture.dbPath);
    db.prepare("INSERT INTO content (image, body) VALUES (?, ?)").run(
      "filename.webp",
      "nested/relative.png",
    );
    db.prepare("INSERT INTO content (image, body) VALUES (?, ?)").run(
      "/images/public.jpg",
      null,
    );
    db.close();

    const result = await stageOrphanedImagesBatch({
      ...fixture,
      batchSize: 20,
      useCursor: false,
    });

    expect(result).toMatchObject({ scannedCount: 4, referencedCount: 3, orphanCount: 1 });
    const staged = JSON.parse(
      readFileSync(join(fixture.stageDir, "staged.json"), "utf8"),
    ) as StagedOrphan[];
    expect(staged.map((entry) => entry.path)).toEqual(["orphan.avif"]);
  });

  it("advances through deterministic batches without staging duplicates", async () => {
    const fixture = createScanFixture();
    for (const name of ["c.webp", "a.webp", "b.webp"]) {
      writeFileSync(join(fixture.imagesDir, name), "image");
    }

    const first = await stageOrphanedImagesBatch({ ...fixture, batchSize: 2 });
    const second = await stageOrphanedImagesBatch({ ...fixture, batchSize: 2 });
    const finished = await stageOrphanedImagesBatch({ ...fixture, batchSize: 2 });

    expect(first).toMatchObject({ startOffset: 0, endOffset: 2, newlyStagedCount: 2 });
    expect(second).toMatchObject({ startOffset: 2, endOffset: 3, newlyStagedCount: 1 });
    expect(finished).toMatchObject({ scannedCount: 0, startOffset: 3, nextOffset: 3 });
    const staged = JSON.parse(
      readFileSync(join(fixture.stageDir, "staged.json"), "utf8"),
    ) as StagedOrphan[];
    expect(staged.map((entry) => entry.path)).toEqual(["a.webp", "b.webp", "c.webp"]);
  });

  it("dry runs create a report but do not change staging or cursor state", async () => {
    const fixture = createScanFixture();
    writeFileSync(join(fixture.imagesDir, "orphan.webp"), "image");

    const result = await stageOrphanedImagesBatch({ ...fixture, dryRun: true });

    expect(result).toMatchObject({ orphanCount: 1, dryRun: true });
    expect(result.reportPath && existsSync(result.reportPath)).toBe(true);
    expect(existsSync(join(fixture.stageDir, "staged.json"))).toBe(false);
    expect(existsSync(join(fixture.stageDir, "cursor.json"))).toBe(false);
  });

  it("ignores hidden files and unsupported file extensions", async () => {
    const fixture = createScanFixture();
    writeFileSync(join(fixture.imagesDir, ".hidden.webp"), "image");
    writeFileSync(join(fixture.imagesDir, "notes.txt"), "not an image");
    writeFileSync(join(fixture.imagesDir, "visible.svg"), "image");

    const result = await stageOrphanedImagesBatch({ ...fixture, useCursor: false });

    expect(result).toMatchObject({ totalImages: 1, scannedCount: 1, orphanCount: 1 });
  });

  it.each([0, -1, Number.NaN])("rejects invalid batch size %s", async (batchSize) => {
    const fixture = createScanFixture();
    await expect(stageOrphanedImagesBatch({ ...fixture, batchSize })).rejects.toThrow(
      "Invalid batch size",
    );
  });
});
