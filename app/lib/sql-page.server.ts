import {
  and,
  asc,
  count,
  desc,
  getTableColumns,
  or,
  sql,
  type InferSelectModel,
  type SQL,
} from "drizzle-orm";
import type { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "~/db";
import { pageResult, type ListInput } from "~/operations/listing";

export function sqlPage<T extends SQLiteTable>(
  table: T,
  input: ListInput,
  search: AnySQLiteColumn[],
  sorts: Record<string, AnySQLiteColumn>,
  where?: SQL,
) {
  const condition = and(
    where,
    input.query
      ? or(
          ...search.map(
            (column) =>
              sql`instr(lower(coalesce(${column}, '')), ${input.query!.toLowerCase()}) > 0`,
          ),
        )
      : undefined,
  );
  const sort = sorts[input.sort];
  if (!sort) throw new Error(`Unsupported sort: ${input.sort}`);
  const direction = input.order === "asc" ? asc : desc;
  const columns = getTableColumns(table);
  const total = db
    .select({ total: count() })
    .from(table as SQLiteTable)
    .where(condition)
    .get()!.total;
  const items = db
    .select()
    .from(table as SQLiteTable)
    .where(condition)
    .orderBy(direction(sort), direction(columns.id))
    .limit(input.limit)
    .offset(input.offset)
    .all() as InferSelectModel<T>[];
  return pageResult(input, items, total);
}
