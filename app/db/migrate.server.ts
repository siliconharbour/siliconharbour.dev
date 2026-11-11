import type Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { normalizeBlockKey } from "~/lib/import-blocklist-key";

export function registerMigrationFunctions(sqlite: Database.Database) {
  sqlite.function("normalize_block_key", { deterministic: true }, (source, key) =>
    normalizeBlockKey(String(source), String(key)),
  );
}

export function migrateDatabase(sqlite: Database.Database, migrationsFolder = "./drizzle") {
  registerMigrationFunctions(sqlite);
  if (sqlite.inTransaction) throw new Error("Migrations require their own transaction");
  sqlite.pragma("foreign_keys = OFF");
  try {
    return sqlite
      .transaction(() => {
        assertDatabaseHealthy(sqlite);
        sqlite.exec(
          "CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `hash` TEXT NOT NULL, `created_at` NUMERIC)",
        );
        const migrations = pendingMigrations(sqlite, migrationsFolder);
        let applied = 0;
        for (const migration of migrations) {
          for (const statement of migration.sql) sqlite.exec(statement);
          sqlite
            .prepare("INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)")
            .run(migration.hash, migration.folderMillis);
          applied++;
        }
        assertDatabaseHealthy(sqlite);
        return { applied };
      })
      .immediate();
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}

function assertDatabaseHealthy(sqlite: Database.Database) {
  const integrity = sqlite.pragma("quick_check", { simple: true });
  if (integrity !== "ok") throw new Error(`Database quick check failed: ${String(integrity)}`);
  const violations = sqlite.pragma("foreign_key_check") as unknown[];
  if (violations.length)
    throw new Error(`Database has foreign key violations: ${JSON.stringify(violations)}`);
}

export function pendingMigrations(sqlite: Database.Database, migrationsFolder = "./drizzle") {
  const migrations = readMigrationFiles({ migrationsFolder });
  const journalExists = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
    .get();
  const latest = journalExists
    ? (sqlite
        .prepare("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1")
        .get() as { created_at: number } | undefined)
    : undefined;
  if (
    latest &&
    (!migrations.length || latest.created_at > migrations[migrations.length - 1].folderMillis)
  )
    throw new Error("Database is newer than the migrations in this image");
  return migrations.filter((migration) => !latest || migration.folderMillis > latest.created_at);
}
