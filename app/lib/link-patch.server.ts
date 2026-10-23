import { sql, type SQLWrapper } from "drizzle-orm";

export function patchLinks(column: SQLWrapper, patch: object | null) {
  return patch === null
    ? null
    : sql`nullif(json_patch(coalesce(${column}, '{}'), ${JSON.stringify(patch)}), '{}')`;
}
