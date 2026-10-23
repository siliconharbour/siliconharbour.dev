import type { ColumnCoverage } from "../coverage";

export function mappedFields(
  operations: string[],
  fields: string[],
): Record<string, ColumnCoverage> {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      {
        mapped: Object.fromEntries(operations.map((operation) => [operation, field])),
      },
    ]),
  );
}
