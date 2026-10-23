import { normalizeBlockKey } from "./import-blocklist-key";
import { db } from "~/db";
import { importBlocklist, type ImportBlocklistItem } from "~/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

function identity(source: string, externalId: string) {
  return and(
    eq(importBlocklist.source, source),
    eq(importBlocklist.externalId, normalizeBlockKey(source, externalId)),
  );
}
export async function isBlocked(source: string, externalId: string): Promise<boolean> {
  return Boolean(await getBlockedItem(source, externalId));
}
export async function getBlockedItems(source: string): Promise<ImportBlocklistItem[]> {
  return db
    .select()
    .from(importBlocklist)
    .where(eq(importBlocklist.source, source))
    .orderBy(desc(importBlocklist.blockedAt), desc(importBlocklist.id));
}
export async function getBlockedExternalIds(source: string): Promise<Set<string>> {
  const items = await db
    .select({ externalId: importBlocklist.externalId })
    .from(importBlocklist)
    .where(eq(importBlocklist.source, source));
  return new Set(items.map((item) => item.externalId));
}
export async function blockItem(
  source: string,
  externalId: string,
  name: string,
  reason?: string,
): Promise<void> {
  await db
    .insert(importBlocklist)
    .values({
      source,
      externalId: normalizeBlockKey(source, externalId),
      name: name.trim(),
      reason,
      blockedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [importBlocklist.source, importBlocklist.externalId],
      set: { reason: sql`coalesce(excluded.reason, ${importBlocklist.reason})` },
    });
}
export async function unblockItem(source: string, externalId: string): Promise<boolean> {
  return db.delete(importBlocklist).where(identity(source, externalId)).run().changes > 0;
}
export async function getBlockedItem(
  source: string,
  externalId: string,
): Promise<ImportBlocklistItem | null> {
  return db.select().from(importBlocklist).where(identity(source, externalId)).get() ?? null;
}
