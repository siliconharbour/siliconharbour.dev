import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export function notRejected(type: "person" | "company", id: AnySQLiteColumn) {
  return sql`NOT EXISTS (SELECT 1 FROM rejected_records WHERE type = ${type} AND entity_id = ${id})`;
}
