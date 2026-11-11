import Database from "better-sqlite3";
import { closeSync, mkdirSync, openSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { openSqlite } from "./sqlite.server";
import { migrateDatabase, pendingMigrations } from "./migrate.server";

export async function migrateFile(
  path: string,
  options: { existing?: boolean; backupDir?: string; migrationsFolder?: string } = {},
) {
  if (!options.existing) mkdirSync(dirname(path), { recursive: true });
  const sqlite = openSqlite(path, { fileMustExist: options.existing, timeout: 30_000 });
  let backupPath: string | undefined;
  try {
    if (options.backupDir && pendingMigrations(sqlite, options.migrationsFolder).length) {
      mkdirSync(options.backupDir, { recursive: true, mode: 0o700 });
      const completed = join(
        options.backupDir,
        `before-migration-${Date.now()}-${randomUUID()}.sqlite`,
      );
      const temporary = `${completed}.partial`;
      closeSync(openSync(temporary, "wx", 0o600));
      try {
        const started = Date.now();
        await sqlite.backup(temporary, {
          progress: () => {
            if (Date.now() - started > 60_000) throw new Error("Database backup timed out");
            return 1000;
          },
        });
        const backup = new Database(temporary, { fileMustExist: true });
        try {
          backup.pragma("foreign_keys = ON");
          // Recovery copies must stand alone without WAL sidecars.
          backup.pragma("journal_mode = DELETE");
          if (backup.pragma("quick_check", { simple: true }) !== "ok")
            throw new Error("Database backup failed validation");
        } finally {
          backup.close();
        }
        renameSync(temporary, completed);
        backupPath = completed;
      } catch (error) {
        rmSync(temporary, { force: true });
        throw error;
      }
    }
    const result = migrateDatabase(sqlite, options.migrationsFolder);
    return { ...result, backupPath };
  } catch (error) {
    if (backupPath) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}. Backup retained at: ${backupPath}.`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    sqlite.close();
  }
}
