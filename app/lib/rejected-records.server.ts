import { and, eq, gt, ne } from "drizzle-orm";
import { db } from "~/db";
import { companies, people, rejectedRecords } from "~/db/schema";
import { NotFoundError, ConflictError } from "~/operations/errors";
import type { ListInput } from "~/operations/listing";
import { sqlPage } from "./sql-page.server";
import { blockItem, unblockItem } from "./import-blocklist.server";
import { normalizeBlockKey } from "./import-blocklist-key";
import { deletePerson } from "./people.server";
import { deleteCompany } from "./companies.server";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export function rejectDirectoryRecord(
  type: "person" | "company",
  id: number,
  now: Date,
  reason?: string | null,
) {
  return db.transaction(() => {
    const existing = db
      .select()
      .from(rejectedRecords)
      .where(and(eq(rejectedRecords.type, type), eq(rejectedRecords.entityId, id)))
      .get();
    if (existing) throw new ConflictError("Record is already rejected");
    const person =
      type === "person" ? db.select().from(people).where(eq(people.id, id)).get() : undefined;
    const company =
      type === "company"
        ? db.select().from(companies).where(eq(companies.id, id)).get()
        : undefined;
    const record = person ?? company;
    if (!record) throw new NotFoundError(`${type === "person" ? "Person" : "Company"} not found`);
    const source = person?.externalLinks?.github
      ? "github"
      : company?.technl
        ? "technl"
        : company?.genesis
          ? "genesis"
          : company?.bounce
            ? "bounce"
            : null;
    const identity = person?.externalLinks?.github || company?.website || company?.name;
    const key = source && identity ? normalizeBlockKey(source, identity) : null;
    const createdBlock =
      source && key
        ? blockItem(
            source,
            key,
            record.name,
            reason === undefined ? "Rejected during review" : reason,
          )
        : false;
    if (type === "person") db.update(people).set({ visible: false }).where(eq(people.id, id)).run();
    else db.update(companies).set({ visible: false }).where(eq(companies.id, id)).run();
    return db
      .insert(rejectedRecords)
      .values({
        type,
        entityId: id,
        name: record.name,
        wasVisible: record.visible,
        blockSource: createdBlock ? source : null,
        blockKey: createdBlock ? key : null,
        rejectedAt: now,
        expiresAt: new Date(now.getTime() + RETENTION_MS),
      })
      .returning()
      .get();
  });
}

export function listRejectedRecords(input: ListInput & { type?: "person" | "company" }) {
  return sqlPage(
    rejectedRecords,
    input,
    [rejectedRecords.name, rejectedRecords.blockKey],
    {
      rejectedAt: rejectedRecords.rejectedAt,
      expiresAt: rejectedRecords.expiresAt,
      name: rejectedRecords.name,
    },
    input.type ? eq(rejectedRecords.type, input.type) : undefined,
  );
}
export function restoreRejectedRecord(id: number, now: Date) {
  return db.transaction(() => {
    const record = db
      .select()
      .from(rejectedRecords)
      .where(and(eq(rejectedRecords.id, id), gt(rejectedRecords.expiresAt, now)))
      .get();
    if (!record) throw new NotFoundError("Rejected record not found or expired");
    const restored =
      record.type === "person"
        ? db
            .update(people)
            .set({ visible: record.wasVisible })
            .where(eq(people.id, record.entityId))
            .run()
        : db
            .update(companies)
            .set({ visible: record.wasVisible })
            .where(eq(companies.id, record.entityId))
            .run();
    if (!restored.changes) throw new NotFoundError("Rejected entity no longer exists");
    if (record.blockSource && record.blockKey) {
      const other = db
        .select({ id: rejectedRecords.id })
        .from(rejectedRecords)
        .where(
          and(
            ne(rejectedRecords.id, id),
            eq(rejectedRecords.blockSource, record.blockSource),
            eq(rejectedRecords.blockKey, record.blockKey),
          ),
        )
        .get();
      if (!other) unblockItem(record.blockSource, record.blockKey);
    }
    db.delete(rejectedRecords).where(eq(rejectedRecords.id, id)).run();
    return { restored: true as const, type: record.type, id: record.entityId };
  });
}
export async function deleteRejectedRecord(id: number) {
  const record = db.select().from(rejectedRecords).where(eq(rejectedRecords.id, id)).get();
  if (!record) throw new NotFoundError("Rejected record not found");
  if (record.type === "person") await deletePerson(record.entityId, true);
  else await deleteCompany(record.entityId, true);
  db.delete(rejectedRecords).where(eq(rejectedRecords.id, id)).run();
  return { deleted: true as const };
}
