import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteAllStagedOrphans,
  deleteStagedOrphan,
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
