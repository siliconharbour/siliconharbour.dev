import Database from "better-sqlite3";

export function openSqlite(path: string, options: Database.Options = {}) {
  const sqlite = new Database(path, { timeout: 5000, ...options });
  try {
    sqlite.pragma("foreign_keys = ON");
    if (sqlite.pragma("foreign_keys", { simple: true }) !== 1)
      throw new Error("SQLite foreign key enforcement is unavailable");
    if (!sqlite.readonly) {
      if (!sqlite.memory && sqlite.pragma("journal_mode", { simple: true }) !== "wal")
        sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("synchronous = FULL");
    }
    return sqlite;
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
