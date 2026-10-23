import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrateDatabase } from "../app/db/migrate.server";

const path = process.env.DB_URL || "./data/siliconharbour.db";
mkdirSync(dirname(path), { recursive: true });
const sqlite = new Database(path);
try {
  migrateDatabase(sqlite);
  console.log("Database migrations applied.");
} finally {
  sqlite.close();
}
