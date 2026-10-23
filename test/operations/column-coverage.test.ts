import { expect, it } from "vitest";
import { is, getTableColumns, getTableName } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "~/db/schema";
import { columnCoverage, operationControlFields, excludedTables } from "~/operations/coverage";
import { operationCatalog } from "~/operations/catalog";
import { z } from "zod";

type Node = {
  properties?: Record<string, Node | boolean>;
  items?: Node | boolean;
  oneOf?: Node[];
  anyOf?: Node[];
};
function hasPath(node: Node | boolean | undefined, path: string[]): boolean {
  if (!node || typeof node !== "object") return false;
  if (!path.length) return true;
  const variants = node.oneOf ?? node.anyOf;
  if (variants) return variants.some((variant) => hasPath(variant, path));
  return hasPath(path[0] === "*" ? node.items : node.properties?.[path[0]], path.slice(1));
}

it("accounts for every column and checks each mapped contract field", () => {
  const tables = Object.values(schema).filter((value) => is(value, SQLiteTable));
  expect([...Object.keys(columnCoverage), ...Object.keys(excludedTables)].sort()).toEqual(
    tables.map(getTableName).sort(),
  );
  for (const reason of Object.values(excludedTables)) expect(reason.trim()).not.toBe("");
  for (const [name, coverage] of Object.entries(columnCoverage)) {
    const table = tables.find((value) => getTableName(value) === name);
    expect(table, name).toBeDefined();
    expect(Object.keys(coverage).sort(), name).toEqual(Object.keys(getTableColumns(table!)).sort());
    for (const entry of Object.values(coverage)) {
      if ("excluded" in entry) expect(entry.excluded.trim().length).toBeGreaterThan(0);
      else if ("gap" in entry) throw new Error(`Unmapped column: ${entry.gap}`);
      else
        for (const [operationName, path] of Object.entries(entry.mapped)) {
          const operation = operationCatalog[operationName as keyof typeof operationCatalog];
          expect(operation, operationName).toBeDefined();
          const json = z.toJSONSchema(operation.input, { io: "input", unrepresentable: "any" });
          expect(
            hasPath(json as Node, path.replaceAll("[]", ".*").split(".")),
            `${operationName}.${path}`,
          ).toBe(true);
        }
    }
  }
});

it("maps every directory create/update field to a real column", () => {
  const names = [
    "person",
    "company",
    "education",
    "group",
    "product",
    "project",
    "technology",
    "event",
    "job",
    "news",
  ];
  for (const name of names)
    for (const suffix of ["Create", "Update"]) {
      const key = name === "news" && suffix === "Create" ? "newsArticleCreate" : `${name}${suffix}`;
      const operation = operationCatalog[key as keyof typeof operationCatalog];
      const json = z.toJSONSchema(operation.input, { io: "input", unrepresentable: "any" });
      for (const field of Object.keys(json.properties ?? {})) {
        if (Object.hasOwn(operationControlFields, field)) {
          expect(
            operationControlFields[field as keyof typeof operationControlFields].length,
          ).toBeGreaterThan(0);
          continue;
        }
        const mapped = Object.values(columnCoverage).some((columns) =>
          Object.values(columns).some(
            (entry) => "mapped" in entry && entry.mapped[key]?.split(/[.[]/)[0] === field,
          ),
        );
        expect(mapped, `${key}.${field}`).toBe(true);
      }
    }
});
