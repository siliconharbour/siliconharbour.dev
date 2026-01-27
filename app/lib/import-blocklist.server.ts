/**
 * Import Blocklist Service
 *
 * Manages a blocklist of entities that should be skipped during imports.
 * When you don't want to import certain GitHub users, TechNL companies, etc.,
 * add them to the blocklist and they'll be automatically skipped.
 */

import { db } from "~/db";
import { importBlocklist, type ImportBlocklistItem } from "~/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Check if an entity is blocked from import
 */
export async function isBlocked(source: string, externalId: string): Promise<boolean> {
  const result = await db
    .select({ id: importBlocklist.id })
    .from(importBlocklist)
    .where(and(eq(importBlocklist.source, source), eq(importBlocklist.externalId, externalId)))
    .get();

  return result !== undefined;
}

/**
 * Get all blocked items for a source
 */
export async function getBlockedItems(source: string): Promise<ImportBlocklistItem[]> {
  return db
    .select()
    .from(importBlocklist)
    .where(eq(importBlocklist.source, source))
    .orderBy(importBlocklist.blockedAt);
}

/**
 * Get blocked external IDs for a source (efficient for checking many items)
 */
export async function getBlockedExternalIds(source: string): Promise<Set<string>> {
  const items = await db
    .select({ externalId: importBlocklist.externalId })
    .from(importBlocklist)
    .where(eq(importBlocklist.source, source));

  return new Set(items.map((i) => i.externalId.toLowerCase()));
}

/**
 * Block an entity from future imports
 */
export async function blockItem(
  source: string,
  externalId: string,
  name: string,
  reason?: string,
): Promise<void> {
  // Check if already blocked
  const existing = await isBlocked(source, externalId);
  if (existing) {
    // Update reason if provided
    if (reason !== undefined) {
      await db
        .update(importBlocklist)
        .set({ reason })
        .where(and(eq(importBlocklist.source, source), eq(importBlocklist.externalId, externalId)));
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

/**
 * Remove an entity from the blocklist (allow future imports)
 */
export async function unblockItem(source: string, externalId: string): Promise<void> {
  await db
    .delete(importBlocklist)
    .where(and(eq(importBlocklist.source, source), eq(importBlocklist.externalId, externalId)));
}

/**
 * Get a single blocked item by source and external ID
 */
export async function getBlockedItem(
  source: string,
  externalId: string,
): Promise<ImportBlocklistItem | null> {
  return (
    db
      .select()
      .from(importBlocklist)
      .where(and(eq(importBlocklist.source, source), eq(importBlocklist.externalId, externalId)))
      .get() ?? null
  );
}
