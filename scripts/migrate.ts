import { openSqlite } from "../app/db/sqlite.server";
import { DB_PATH } from "../app/lib/paths.server";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrateDatabase } from "../app/db/migrate.server";

const path = DB_PATH;
mkdirSync(dirname(path), { recursive: true });
const sqlite = openSqlite(path);
try {
  migrateDatabase(sqlite);
  console.log("Database migrations applied.");
} finally {
  sqlite.close();
}
