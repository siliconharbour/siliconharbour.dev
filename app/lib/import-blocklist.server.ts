import { normalizeBlockKey } from "./import-blocklist-key";

import { db } from "~/db";
import { importBlocklist, type ImportBlocklistItem } from "~/db/schema";
import { eq } from "drizzle-orm";

export async function isBlocked(source: string, externalId: string): Promise<boolean> {
  const key = normalizeBlockKey(source, externalId);
  const items = await getBlockedItems(source);
  return items.some((item) => normalizeBlockKey(source, item.externalId) === key);
}

export async function getBlockedItems(source: string): Promise<ImportBlocklistItem[]> {
  return db
    .select()
    .from(importBlocklist)
    .where(eq(importBlocklist.source, source))
    .orderBy(importBlocklist.blockedAt);
}

export async function getBlockedExternalIds(source: string): Promise<Set<string>> {
  const items = await db
    .select({ externalId: importBlocklist.externalId })
    .from(importBlocklist)
    .where(eq(importBlocklist.source, source));

  return new Set(items.map((i) => normalizeBlockKey(source, i.externalId)));
}

export async function blockItem(
  source: string,
  externalId: string,
  name: string,
  reason?: string,
): Promise<void> {
  externalId = normalizeBlockKey(source, externalId);
  const existing = (await getBlockedItems(source)).find(
    (item) => normalizeBlockKey(source, item.externalId) === externalId,
  );
  if (existing) {
    if (reason !== undefined) {
      await db.update(importBlocklist).set({ reason }).where(eq(importBlocklist.id, existing.id));
    }
    return;
  }

  await db.insert(importBlocklist).values({
    source,
    externalId,
    name,
    reason,
    blockedAt: new Date(),
  });
}

export async function unblockItem(source: string, externalId: string): Promise<void> {
  const items = await getBlockedItems(source);
  const key = normalizeBlockKey(source, externalId);
  for (const item of items) {
    if (normalizeBlockKey(source, item.externalId) === key)
      await db.delete(importBlocklist).where(eq(importBlocklist.id, item.id));
  }
}

export async function getBlockedItem(
  source: string,
  externalId: string,
): Promise<ImportBlocklistItem | null> {
  const key = normalizeBlockKey(source, externalId);
  return (
    (await getBlockedItems(source)).find(
      (item) => normalizeBlockKey(source, item.externalId) === key,
    ) ?? null
  );
}
