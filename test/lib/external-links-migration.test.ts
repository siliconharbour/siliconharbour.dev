import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { migrateDatabase } from "~/db/migrate.server";

it("moves existing links into JSON without losing identities, FTS, or ID counters", () => {
  const sqlite = new Database(":memory:");
  const before = mkdtempSync(join(tmpdir(), "external-links-migration-"));
  cpSync("drizzle", before, { recursive: true });
  const journalPath = join(before, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 62);
  writeFileSync(journalPath, JSON.stringify(journal));
  try {
    migrateDatabase(sqlite, before);
    sqlite.exec(`
      INSERT INTO companies(id,slug,name,description,linkedin,github,wikipedia,created_at,updated_at)
      VALUES (1,'acme','Acme','Description','https://www.linkedin.com/company/Acme/','https://github.com/acme','https://en.wikipedia.org/wiki/Acme',1,1),
        (2,'beta','Beta','Description','https://linkedin.com/company/beta',NULL,NULL,1,1),
        (3,'blank','Blank','Description','  ',' ',NULL,1,1),
        (4,'empty','Empty','Description',NULL,NULL,NULL,1,1);
      INSERT INTO people(id,slug,name,bio,github,social_links,created_at,updated_at)
      VALUES (1,'alice','Alice',NULL,'https://github.com/alice','{"mastodon":"https://example.com/@alice","bluesky":"https://bsky.app/profile/alice.example.com"}',1,1),
        (2,'bob','Bob',NULL,NULL,'{"twitter":"https://x.com/bob"}',1,1),
        (3,'empty','Empty',NULL,NULL,NULL,1,1);
      INSERT INTO companies(id,slug,name,description,created_at,updated_at) VALUES(100,'deleted','Deleted','Description',1,1);
      DELETE FROM companies WHERE id=100;
      INSERT INTO people(id,slug,name,created_at,updated_at) VALUES(200,'deleted','Deleted',1,1);
      DELETE FROM people WHERE id=200;
      INSERT INTO rejected_records(type,entity_id,name,was_visible,rejected_at,expires_at) VALUES('company',1,'Acme',1,1,2);
    `);
    const sequences = sqlite
      .prepare(
        "SELECT name,seq FROM sqlite_sequence WHERE name IN ('people','companies') ORDER BY name",
      )
      .all();
    migrateDatabase(sqlite);
    const companyLinks = sqlite
      .prepare("SELECT external_links FROM companies ORDER BY id")
      .all() as { external_links: string | null }[];
    expect(
      companyLinks.map((row) => (row.external_links ? JSON.parse(row.external_links) : null)),
    ).toEqual([
      {
        github: "https://github.com/acme",
        wikipedia: "https://en.wikipedia.org/wiki/Acme",
        linkedin: "https://linkedin.com/company/Acme/",
      },
      { linkedin: "https://linkedin.com/company/beta" },
      null,
      null,
    ]);
    const personLinks = sqlite.prepare("SELECT external_links FROM people ORDER BY id").all() as {
      external_links: string | null;
    }[];
    expect(
      personLinks.map((row) => (row.external_links ? JSON.parse(row.external_links) : null)),
    ).toEqual([
      {
        github: "https://github.com/alice",
        mastodon: "https://example.com/@alice",
        bluesky: "https://bsky.app/profile/alice.example.com",
      },
      { twitter: "https://x.com/bob" },
      null,
    ]);
    for (const table of ["people", "companies"]) {
      const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      expect(columns.map((column) => column.name)).not.toContain("github");
      expect(
        columns.some((column) => ["social_links", "linkedin", "wikipedia"].includes(column.name)),
      ).toBe(false);
      sqlite.exec(`UPDATE ${table} SET name='Searchable' WHERE id=1`);
      expect(
        sqlite
          .prepare(`SELECT rowid FROM ${table}_fts WHERE ${table}_fts MATCH 'Searchable'`)
          .all(),
      ).toEqual([{ rowid: 1 }]);
    }
    expect(sqlite.prepare("SELECT entity_id FROM rejected_records").all()).toEqual([
      { entity_id: 1 },
    ]);
    expect(
      sqlite
        .prepare(
          "SELECT name,seq FROM sqlite_sequence WHERE name IN ('people','companies') ORDER BY name",
        )
        .all(),
    ).toEqual(sequences);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    migrateDatabase(sqlite);
    expect(
      sqlite
        .prepare(
          "SELECT name,seq FROM sqlite_sequence WHERE name IN ('people','companies') ORDER BY name",
        )
        .all(),
    ).toEqual(sequences);
  } finally {
    sqlite.close();
    rmSync(before, { recursive: true, force: true });
  }
});
