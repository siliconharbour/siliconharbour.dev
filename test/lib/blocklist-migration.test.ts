import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { migrateDatabase } from "~/db/migrate.server";

it("normalizes and deduplicates stored blocks before enforcing indexed uniqueness", () => {
  const sqlite = new Database(":memory:");
  const beforeMigration = mkdtempSync(join(tmpdir(), "blocklist-migration-"));
  cpSync("drizzle", beforeMigration, { recursive: true });
  const journalPath = join(beforeMigration, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 59);
  writeFileSync(journalPath, JSON.stringify(journal));
  try {
    migrateDatabase(sqlite, beforeMigration);
    const insert = sqlite.prepare(
      "INSERT INTO `import_blocklist` (`source`, `external_id`, `name`, `reason`, `blocked_at`) VALUES (?, ?, ?, ?, ?)",
    );
    insert.run("github", "https://github.com/Foo/", "Foo", "short", 100);
    insert.run("github", "@FOO", "Foo", "More informative reason", 200);
    insert.run("technl", "  HTTPS://WWW.Example.com/Path/  ", "Example", null, 300);
    migrateDatabase(sqlite);
    const rows = sqlite
      .prepare(
        "SELECT `source`, `external_id`, `reason`, `blocked_at` FROM `import_blocklist` ORDER BY `source`",
      )
      .all();
    expect(rows).toEqual([
      { source: "github", external_id: "foo", reason: "More informative reason", blocked_at: 100 },
      { source: "technl", external_id: "example.com/path", reason: null, blocked_at: 300 },
    ]);
    expect(() => insert.run("github", "foo", "Duplicate", null, 400)).toThrow("UNIQUE constraint");
    migrateDatabase(sqlite);
    expect(
      sqlite
        .prepare(
          "SELECT `source`, `external_id`, `reason`, `blocked_at` FROM `import_blocklist` ORDER BY `source`",
        )
        .all(),
    ).toEqual(rows);
    const plan = sqlite
      .prepare(
        "EXPLAIN QUERY PLAN SELECT * FROM `import_blocklist` WHERE `source` = ? AND `external_id` = ?",
      )
      .all("github", "foo");
    expect(JSON.stringify(plan)).toContain("blocklist_source_external_idx");
  } finally {
    sqlite.close();
    rmSync(beforeMigration, { recursive: true, force: true });
  }
});
