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
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `hash` TEXT NOT NULL, `created_at` NUMERIC)",
  );
  sqlite.transaction(() => {
    const latest = sqlite
      .prepare("SELECT `created_at` FROM `__drizzle_migrations` ORDER BY `created_at` DESC LIMIT 1")
      .get() as { created_at: number } | undefined;
    for (const migration of readMigrationFiles({ migrationsFolder })) {
      if (latest && latest.created_at >= migration.folderMillis) continue;
      for (const statement of migration.sql) sqlite.exec(statement);
      sqlite
        .prepare("INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)")
        .run(migration.hash, migration.folderMillis);
    }
  })();
}
