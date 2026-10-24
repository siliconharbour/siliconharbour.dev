import { db, rawDb } from "~/db";
import { companies, education } from "~/db/schema";
import { eq } from "drizzle-orm";
import { getAllCompanies } from "./companies.server";
import { getAllEducation } from "./education.server";
import { normalizeUrl } from "./directory-import";
import { closestNames } from "./name-suggestions";
import { NotFoundError } from "~/operations/errors";
import type { ScrapedCompany } from "./scraper.server";

export type DirectorySource = "technl" | "genesis" | "bounce";
export type DirectoryEntity = { type: "company" | "education"; id: number };
export function sourceTrackingFields(source: DirectorySource) {
  return { externalId: `${source}ExternalId`, lastSeenAt: `${source}LastSeenAt` } as const;
}
export async function directoryRecords() {
  const [companyRows, educationRows] = await Promise.all([
    getAllCompanies(true),
    getAllEducation(true),
  ]);
  return [
    ...companyRows.map((row) => ({ type: "company" as const, row })),
    ...educationRows.map((row) => ({ type: "education" as const, row })),
  ];
}
type Records = Awaited<ReturnType<typeof directoryRecords>>;
const nameKey = (name: string) =>
  name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export function matchDirectoryRecord(
  records: Records,
  source: DirectorySource,
  entry: ScrapedCompany,
) {
  const fields = sourceTrackingFields(source);
  const checks = [
    (record: Records[number]) =>
      !!entry.sourceId && record.row[fields.externalId] === entry.sourceId,
    (record: Records[number]) =>
      !!entry.website &&
      !!record.row.website &&
      normalizeUrl(record.row.website) === normalizeUrl(entry.website),
    (record: Records[number]) => nameKey(record.row.name) === nameKey(entry.name),
  ];
  for (const check of checks) {
    const matches = records.filter(check);
    if (matches.length) return matches.length === 1 ? matches[0] : null;
  }
  return null;
}
function directoryCountWarning(entries: number, flagged: number) {
  return entries === 0 || entries < flagged / 2
    ? "The directory returned fewer entries than expected. Membership removals are unavailable; check the source and fetch again."
    : null;
}
export async function reviewDirectorySource(source: DirectorySource, entries: ScrapedCompany[]) {
  const records = await directoryRecords();
  const flagged = records.filter(({ row }) => row[source]);
  const warning = directoryCountWarning(entries.length, flagged.length);
  const matched = new Set(
    entries.flatMap((entry) => {
      const match = matchDirectoryRecord(records, source, entry);
      return match ? [`${match.type}:${match.row.id}`] : [];
    }),
  );
  const fields = sourceTrackingFields(source);
  const droppedOff = warning
    ? []
    : flagged
        .filter((record) => !matched.has(`${record.type}:${record.row.id}`))
        .map(({ type, row }) => {
          const sameDomain = row.website
            ? entries.find(
                (entry) =>
                  entry.website &&
                  normalizeUrl(entry.website).split("/")[0] ===
                    normalizeUrl(row.website!).split("/")[0],
              )
            : undefined;
          const nearby = closestNames(
            row.name,
            entries.map((entry) => entry.name),
          )[0];
          const suggestion = sameDomain ?? entries.find((entry) => entry.name === nearby);
          return {
            type,
            id: row.id,
            slug: row.slug,
            name: row.name,
            website: row.website,
            externalId: row[fields.externalId],
            lastSeenAt: row[fields.lastSeenAt]?.toISOString() ?? null,
            possibleMatch: suggestion
              ? {
                  name: suggestion.name,
                  website: suggestion.website,
                  sourceId: suggestion.sourceId,
                }
              : null,
          };
        });
  return { companies: entries, droppedOff, warning, matchedCount: matched.size };
}
export function recordDirectoryObservation(
  entity: DirectoryEntity,
  source: DirectorySource,
  externalId: string,
  now: Date,
) {
  const fields = sourceTrackingFields(source);
  const values = {
    ...(externalId ? { [fields.externalId]: externalId } : {}),
    [fields.lastSeenAt]: now,
  };
  if (entity.type === "company")
    db.update(companies).set(values).where(eq(companies.id, entity.id)).run();
  else db.update(education).set(values).where(eq(education.id, entity.id)).run();
}
export async function reconcileDirectorySource(
  source: DirectorySource,
  entries: ScrapedCompany[],
  now: Date,
) {
  const records = await directoryRecords();
  const warning = directoryCountWarning(
    entries.length,
    records.filter(({ row }) => row[source]).length,
  );
  if (warning) return { recorded: 0, warning };
  let recorded = 0;
  rawDb.transaction(() => {
    for (const entry of entries) {
      const match = matchDirectoryRecord(records, source, entry);
      if (!match) continue;
      recordDirectoryObservation(
        { type: match.type, id: match.row.id },
        source,
        entry.sourceId,
        now,
      );
      recorded++;
    }
  })();
  return { recorded, warning: null };
}
export async function clearDirectorySourceFlags(
  source: DirectorySource,
  entities: DirectoryEntity[],
  now: Date,
) {
  const records = await directoryRecords();
  const unique = [
    ...new Map(entities.map((entity) => [`${entity.type}:${entity.id}`, entity])).values(),
  ];
  for (const entity of unique) {
    if (!records.some((record) => record.type === entity.type && record.row.id === entity.id))
      throw new NotFoundError("Directory entry not found");
  }
  rawDb.transaction(() => {
    for (const entity of unique) {
      if (entity.type === "company")
        db.update(companies)
          .set({ [source]: false, updatedAt: now })
          .where(eq(companies.id, entity.id))
          .run();
      else
        db.update(education)
          .set({ [source]: false, updatedAt: now })
          .where(eq(education.id, entity.id))
          .run();
    }
  })();
  return { cleared: unique.length, entities: unique };
}
