import type { ExternalLinks, LinkPatch } from "./links";
import { linkValue } from "./link-patch.server";
import { normalizeUrl } from "./directory-import";
import { db } from "~/db";
import { companies, people, rejectedRecords } from "~/db/schema";
import { canonicalUrl, githubProfile } from "./url-fields";
import { ConflictError } from "~/operations/errors";
import { and, eq, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export function notRejected(type: "person" | "company", id: AnySQLiteColumn) {
  return sql`NOT EXISTS (SELECT 1 FROM rejected_records WHERE type = ${type} AND entity_id = ${id})`;
}

export function assertDirectoryIdentityAvailable(
  type: "person" | "company",
  values: { externalLinks?: LinkPatch<ExternalLinks>; website?: string | null },
) {
  const field =
    type === "person" && values.externalLinks?.github
      ? "github"
      : values.website
        ? "website"
        : "github";
  const schema = field === "github" ? githubProfile() : canonicalUrl();
  const keyOf = (value: string | null | undefined) => {
    const parsed = schema.safeParse(value);
    return parsed.success ? (field === "website" ? normalizeUrl(parsed.data) : parsed.data) : null;
  };
  const expected = keyOf(field === "github" ? values.externalLinks?.github : values.website);
  if (!expected) return;
  const table = type === "person" ? people : companies;
  const retained = db
    .select({
      value: field === "github" ? linkValue(table.externalLinks, "github") : table.website,
    })
    .from(table)
    .innerJoin(
      rejectedRecords,
      and(eq(rejectedRecords.type, type), eq(rejectedRecords.entityId, table.id)),
    )
    .all();
  if (retained.some((row) => keyOf(row.value) === expected))
    throw new ConflictError("Identity is rejected; restore or permanently delete it first");
}
