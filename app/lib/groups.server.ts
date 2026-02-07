import { db } from "~/db";
import { groups, type Group, type NewGroup } from "~/db/schema";
import { eq, desc, asc, count, inArray, and } from "drizzle-orm";
import { syncReferences } from "./references.server";
import { searchContentIds } from "./search.server";
import { generateEntitySlug, getPaginatedBySearch } from "./crud-helpers.server";

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: groups.slug }).from(groups);
  return rows.map((r) => r.slug);
}

export async function generateGroupSlug(name: string, excludeId?: number): Promise<string> {
  return generateEntitySlug({
    name,
    excludeId,
    getExistingSlugs,
    getSlugForId: async (id) => {
      const current = await db.select({ slug: groups.slug }).from(groups).where(eq(groups.id, id)).get();
      return current?.slug ?? null;
    },
  });
}

export async function createGroup(group: Omit<NewGroup, "slug">): Promise<Group> {
  const slug = await generateGroupSlug(group.name);
  const [newGroup] = await db
    .insert(groups)
    .values({ ...group, slug })
    .returning();

  await syncReferences("group", newGroup.id, newGroup.description);

  return newGroup;
}

export async function updateGroup(
  id: number,
  group: Partial<Omit<NewGroup, "slug">>,
): Promise<Group | null> {
  let updateData: Partial<NewGroup> = { ...group, updatedAt: new Date() };

  if (group.name) {
    updateData.slug = await generateGroupSlug(group.name, id);
  }

  const [updated] = await db.update(groups).set(updateData).where(eq(groups.id, id)).returning();

  if (!updated) return null;

  if (group.description) {
    await syncReferences("group", id, group.description);
  }

  return updated;
}

export async function deleteGroup(id: number): Promise<boolean> {
  await db.delete(groups).where(eq(groups.id, id));
  return true;
}

export async function getGroupById(id: number): Promise<Group | null> {
  return db.select().from(groups).where(eq(groups.id, id)).get() ?? null;
}

export async function getGroupBySlug(slug: string): Promise<Group | null> {
  return db.select().from(groups).where(eq(groups.slug, slug)).get() ?? null;
}

export async function getAllGroups(includeHidden: boolean = false): Promise<Group[]> {
  if (includeHidden) {
    return db.select().from(groups).orderBy(desc(groups.createdAt));
  }
  return db.select().from(groups).where(eq(groups.visible, true)).orderBy(desc(groups.createdAt));
}

// =============================================================================
// Paginated queries with search
// =============================================================================

export interface PaginatedGroups {
  items: Group[];
  total: number;
}

export async function getPaginatedGroups(
  limit: number,
  offset: number,
  searchQuery?: string,
  includeHidden: boolean = false,
): Promise<PaginatedGroups> {
  const visibilityFilter = includeHidden ? undefined : eq(groups.visible, true);
  return getPaginatedBySearch({
    searchQuery,
    getSearchIds: (query) => searchContentIds("group", query),
    getAllWhenNoSearch: async () => {
      const [{ total }] = await db.select({ total: count() }).from(groups).where(visibilityFilter);
      const items = await db
        .select()
        .from(groups)
        .where(visibilityFilter)
        .orderBy(asc(groups.name))
        .limit(limit)
        .offset(offset);
      return { items, total };
    },
    getByIdsWhenSearch: async (matchingIds) => {
      const whereClause = visibilityFilter
        ? and(inArray(groups.id, matchingIds), visibilityFilter)
        : inArray(groups.id, matchingIds);
      const items = await db
        .select()
        .from(groups)
        .where(whereClause)
        .orderBy(asc(groups.name))
        .limit(limit)
        .offset(offset);
      const allMatching = await db.select({ id: groups.id }).from(groups).where(whereClause);
      return { items, total: allMatching.length };
    },
  });
}
