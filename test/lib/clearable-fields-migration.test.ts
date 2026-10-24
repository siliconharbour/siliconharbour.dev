import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { migrateDatabase } from "~/db/migrate.server";

it("rebuilds nullable columns without losing event relations, indexes, FTS triggers or bios", () => {
  const sqlite = new Database(":memory:");
  const before = mkdtempSync(join(tmpdir(), "clearable-migration-"));
  cpSync("drizzle", before, { recursive: true });
  const journalPath = join(before, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 61);
  writeFileSync(journalPath, JSON.stringify(journal));
  try {
    migrateDatabase(sqlite, before);
    sqlite.pragma("foreign_keys=ON");
    sqlite.exec(`INSERT INTO people(id,slug,name,bio,created_at,updated_at) VALUES (1,'blank','Blank',' \t\n \u00a0\u2003',1,1),(2,'kept','Kept','Original bio',1,1);
      INSERT INTO events(id,slug,title,description,link,created_at,updated_at) VALUES(1,'parent','Parent','Description','https://example.com',1,1);
      INSERT INTO events(id,slug,title,description,link,parent_event_id,created_at,updated_at) VALUES(2,'child','Child','Description',' ',1,1,1);
      INSERT INTO event_dates(event_id,start_date) VALUES(2,1);`);
    migrateDatabase(sqlite);
    expect(sqlite.prepare("SELECT bio FROM people ORDER BY id").all()).toEqual([
      { bio: null },
      { bio: "Original bio" },
    ]);
    expect(sqlite.prepare("SELECT parent_event_id,link FROM events WHERE id=2").get()).toEqual({
      parent_event_id: 1,
      link: null,
    });
    expect(sqlite.prepare("SELECT event_id FROM event_dates").all()).toEqual([{ event_id: 2 }]);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    sqlite.exec("UPDATE people SET bio='Searchable' WHERE id=1");
    expect(
      sqlite.prepare("SELECT rowid FROM people_fts WHERE people_fts MATCH 'Searchable'").all(),
    ).toEqual([{ rowid: 1 }]);
    expect(() =>
      sqlite.exec(
        "INSERT INTO people(slug,name,created_at,updated_at) VALUES('blank','Duplicate',1,1)",
      ),
    ).toThrow(/UNIQUE/);
    expect(() => sqlite.exec("INSERT INTO event_dates(event_id,start_date) VALUES(999,1)")).toThrow(
      /FOREIGN/,
    );
    migrateDatabase(sqlite);
  } finally {
    sqlite.close();
    rmSync(before, { recursive: true, force: true });
  }
});
