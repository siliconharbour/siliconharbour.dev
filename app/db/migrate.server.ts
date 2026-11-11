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
        assertForeignKeys(sqlite);
        sqlite.exec(
          "CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `hash` TEXT NOT NULL, `created_at` NUMERIC)",
        );
        const latest = sqlite
          .prepare(
            "SELECT `created_at` FROM `__drizzle_migrations` ORDER BY `created_at` DESC LIMIT 1",
          )
          .get() as { created_at: number } | undefined;
        const migrations = readMigrationFiles({ migrationsFolder });
        if (
          latest &&
          (!migrations.length || latest.created_at > migrations[migrations.length - 1].folderMillis)
        )
          throw new Error("Database is newer than the migrations in this image");
        let applied = 0;
        for (const migration of migrations) {
          if (latest && latest.created_at >= migration.folderMillis) continue;
          for (const statement of migration.sql) sqlite.exec(statement);
          sqlite
            .prepare("INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)")
            .run(migration.hash, migration.folderMillis);
          applied++;
        }
        assertForeignKeys(sqlite);
        return { applied };
      })
      .immediate();
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}

function assertForeignKeys(sqlite: Database.Database) {
  const violations = sqlite.pragma("foreign_key_check") as unknown[];
  if (violations.length)
    throw new Error(`Database has foreign key violations: ${JSON.stringify(violations)}`);
}
