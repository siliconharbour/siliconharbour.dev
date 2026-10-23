import { expect, it } from "vitest";
import { is, getTableColumns, getTableName } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "~/db/schema";
import { columnCoverage } from "~/operations/coverage";
import { operationCatalog } from "~/operations/catalog";
import { z } from "zod";

it("accounts for every column of each covered table", () => {
  const tables = Object.values(schema).filter((value) => is(value, SQLiteTable));
  for (const [name, coverage] of Object.entries(columnCoverage)) {
    const table = tables.find((value) => getTableName(value) === name);
    expect(table, name).toBeDefined();
    expect(Object.keys(coverage).sort(), name).toEqual(Object.keys(getTableColumns(table!)).sort());
    for (const entry of Object.values(coverage)) {
      if ("excluded" in entry) expect(entry.excluded.trim().length).toBeGreaterThan(0);
      else if ("gap" in entry) expect(entry.gap).toMatch(new RegExp(`^${name}\\.`));
      else {
        const operation = operationCatalog[entry.operation as keyof typeof operationCatalog];
        expect(operation, entry.operation).toBeDefined();
        const json = z.toJSONSchema(operation.input, { io: "input", unrepresentable: "any" });
        expect(json.properties).toHaveProperty(entry.field);
      }
    }
  }
});
