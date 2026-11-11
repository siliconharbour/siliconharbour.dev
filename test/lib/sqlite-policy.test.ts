import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openSqlite } from "~/db/sqlite.server";
import { migrateDatabase } from "~/db/migrate.server";

it("enforces references and cascades while WAL readers retain a consistent snapshot", () => {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-policy-"));
  const path = join(dir, "db.sqlite");
  const writer = openSqlite(path);
  writer.exec(
    "CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id) ON DELETE CASCADE); INSERT INTO parent VALUES(1); INSERT INTO child VALUES(1);",
  );
  const reader = openSqlite(path, { readonly: true });
  try {
    expect(writer.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(writer.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(writer.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(writer.pragma("synchronous", { simple: true })).toBe(2);
    expect(() => writer.exec("INSERT INTO child VALUES(999)")).toThrow(/FOREIGN KEY/);
    reader.exec("BEGIN");
    expect(reader.prepare("SELECT count(*) AS n FROM child").get()).toEqual({ n: 1 });
    writer.exec("DELETE FROM parent WHERE id=1");
    expect(writer.prepare("SELECT count(*) AS n FROM child").get()).toEqual({ n: 0 });
    expect(reader.prepare("SELECT count(*) AS n FROM child").get()).toEqual({ n: 1 });
    reader.exec("COMMIT");
    expect(reader.prepare("SELECT count(*) AS n FROM child").get()).toEqual({ n: 0 });
  } finally {
    reader.close();
    writer.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("rolls back invalid migrations and their journal entries, then restores enforcement", () => {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-migration-"));
  mkdirSync(join(dir, "meta"));
  writeFileSync(
    join(dir, "meta/_journal.json"),
    JSON.stringify({ entries: [{ idx: 0, when: 1, tag: "0000_invalid", breakpoints: true }] }),
  );
  writeFileSync(
    join(dir, "0000_invalid.sql"),
    "CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES(99);",
  );
  const sqlite = openSqlite(":memory:");
  try {
    expect(() => migrateDatabase(sqlite, dir)).toThrow(/foreign key violations/);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    sqlite.exec(
      "CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id));",
    );
    sqlite.pragma("foreign_keys=OFF");
    sqlite.exec("INSERT INTO child VALUES(99)");
    expect(() => migrateDatabase(sqlite, dir)).toThrow(/foreign key violations/);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
