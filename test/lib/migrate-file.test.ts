import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openSqlite } from "~/db/sqlite.server";
import { migrateFile } from "~/db/migrate-file.server";

it("backs up committed WAL data, migrates beside a live reader, and does not repeat applied work", async () => {
  const dir = mkdtempSync(join(tmpdir(), "online-migration-"));
  const path = join(dir, "db.sqlite"),
    migrationsFolder = join(dir, "drizzle"),
    backupDir = join(dir, "backups");
  mkdirSync(join(migrationsFolder, "meta"), { recursive: true });
  writeFileSync(
    join(migrationsFolder, "meta/_journal.json"),
    JSON.stringify({ entries: [{ idx: 0, when: 1, tag: "0000_add_note", breakpoints: true }] }),
  );
  writeFileSync(join(migrationsFolder, "0000_add_note.sql"), "ALTER TABLE items ADD note TEXT;");
  const app = openSqlite(path);
  app.exec(
    "CREATE TABLE items(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO items VALUES(1,'original');",
  );
  try {
    const blockedBackup = join(dir, "not-a-directory");
    writeFileSync(blockedBackup, "occupied");
    await expect(
      migrateFile(path, { existing: true, migrationsFolder, backupDir: blockedBackup }),
    ).rejects.toThrow();
    expect(
      (app.pragma("table_info(items)") as Array<{ name: string }>).map((column) => column.name),
    ).toEqual(["id", "value"]);
    app.exec("BEGIN");
    app.prepare("SELECT * FROM items").all();
    const result = await migrateFile(path, { existing: true, migrationsFolder, backupDir });
    expect(result.applied).toBe(1);
    expect(statSync(result.backupPath!).mode & 0o777).toBe(0o600);
    expect(app.prepare("SELECT * FROM items").get()).toEqual({ id: 1, value: "original" });
    app.exec("COMMIT");
    expect(app.prepare("SELECT * FROM items").get()).toEqual({
      id: 1,
      value: "original",
      note: null,
    });
    app.exec("INSERT INTO items VALUES(2,'new',NULL)");
    const backup = openSqlite(result.backupPath!, { readonly: true });
    try {
      expect(backup.prepare("SELECT * FROM items").all()).toEqual([{ id: 1, value: "original" }]);
    } finally {
      backup.close();
    }
    expect(await migrateFile(path, { existing: true, migrationsFolder, backupDir })).toEqual({
      applied: 0,
      backupPath: undefined,
    });
    expect(readdirSync(backupDir)).toHaveLength(1);
    writeFileSync(
      join(migrationsFolder, "0001_bad.sql"),
      "CREATE TABLE child(parent_id INTEGER REFERENCES items(id)); INSERT INTO child VALUES(999);",
    );
    writeFileSync(
      join(migrationsFolder, "meta/_journal.json"),
      JSON.stringify({
        entries: [
          { idx: 0, when: 1, tag: "0000_add_note", breakpoints: true },
          { idx: 1, when: 2, tag: "0001_bad", breakpoints: true },
        ],
      }),
    );
    await expect(
      migrateFile(path, { existing: true, migrationsFolder, backupDir }),
    ).rejects.toThrow(/foreign key violations.*Backup retained/s);
    expect(app.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get()).toEqual({ n: 1 });
    expect(app.prepare("SELECT name FROM sqlite_master WHERE name='child'").get()).toBeUndefined();
    expect(app.prepare("SELECT count(*) AS n FROM items").get()).toEqual({ n: 2 });
  } finally {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("refuses missing production volumes and older migration images", async () => {
  const dir = mkdtempSync(join(tmpdir(), "migration-preconditions-"));
  try {
    const path = join(dir, "missing.sqlite");
    await expect(migrateFile(path, { existing: true })).rejects.toThrow();
    expect(readdirSync(dir)).toEqual([]);
    const sqlite = openSqlite(path);
    sqlite.exec(
      "CREATE TABLE __drizzle_migrations(id INTEGER PRIMARY KEY, hash TEXT, created_at INTEGER); INSERT INTO __drizzle_migrations VALUES(1,'future',9999999999999);",
    );
    sqlite.close();
    await expect(migrateFile(path, { existing: true })).rejects.toThrow(
      /newer than the migrations/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
