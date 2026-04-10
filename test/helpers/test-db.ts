import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../app/db/schema";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

function getMigrationStatements(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const statements: string[] = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    const parts = sql.split("--> statement-breakpoint");
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed) statements.push(trimmed);
    }
  }
  return statements;
}

// Cache parsed migrations — they don't change during a test run
let cachedStatements: string[] | null = null;

export function createTestDb() {
  if (!cachedStatements) {
    cachedStatements = getMigrationStatements();
  }

  const sqlite = new Database(":memory:");

  for (const stmt of cachedStatements) {
    try {
      sqlite.exec(stmt);
    } catch (e) {
      // ALTER TABLE on fresh DB may hit "duplicate column" if a later migration
      // adds a column that a CREATE TABLE already includes. Safe to skip.
      const msg = String(e);
      if (msg.includes("duplicate column") || msg.includes("already exists")) {
        continue;
      }
      throw e;
    }
  }

  const db = drizzle(sqlite, { schema });
  return { db, rawDb: sqlite };
}
