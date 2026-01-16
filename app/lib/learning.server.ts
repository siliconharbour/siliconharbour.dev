import { db } from "~/db";
import { learning, type Learning, type NewLearning } from "~/db/schema";
import { eq, desc, asc, count, inArray } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";
import { searchContentIds } from "./search.server";

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: learning.slug }).from(learning);
  return rows.map(r => r.slug);
}

export async function generateLearningSlug(name: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(name);
  let existingSlugs = await getExistingSlugs();
  
  if (excludeId) {
    const current = await db.select({ slug: learning.slug }).from(learning).where(eq(learning.id, excludeId)).get();
    if (current) {
      existingSlugs = existingSlugs.filter(s => s !== current.slug);
    }
  }
  
  return makeSlugUnique(baseSlug, existingSlugs);
}

export async function createLearning(item: Omit<NewLearning, "slug">): Promise<Learning> {
  const slug = await generateLearningSlug(item.name);
  const [newItem] = await db.insert(learning).values({ ...item, slug }).returning();
  
  await syncReferences("learning", newItem.id, newItem.description);
  
  return newItem;
}

export async function updateLearning(id: number, item: Partial<Omit<NewLearning, "slug">>): Promise<Learning | null> {
  let updateData: Partial<NewLearning> = { ...item, updatedAt: new Date() };
  
  if (item.name) {
    updateData.slug = await generateLearningSlug(item.name, id);
  }
  
  const [updated] = await db
    .update(learning)
    .set(updateData)
    .where(eq(learning.id, id))
    .returning();

  if (!updated) return null;

  if (item.description) {
    await syncReferences("learning", id, item.description);
  }

  return updated;
}

export async function deleteLearning(id: number): Promise<boolean> {
  await db.delete(learning).where(eq(learning.id, id));
  return true;
}

export async function getLearningById(id: number): Promise<Learning | null> {
  return db.select().from(learning).where(eq(learning.id, id)).get() ?? null;
}

export async function getLearningBySlug(slug: string): Promise<Learning | null> {
  return db.select().from(learning).where(eq(learning.slug, slug)).get() ?? null;
}

export async function getAllLearning(): Promise<Learning[]> {
  return db.select().from(learning).orderBy(desc(learning.createdAt));
}

// =============================================================================
// Paginated queries with search
// =============================================================================

export interface PaginatedLearning {
  items: Learning[];
  total: number;
}

export async function getPaginatedLearning(
  limit: number,
  offset: number,
  searchQuery?: string
): Promise<PaginatedLearning> {
  // If searching, use FTS5
  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("learning", searchQuery);
    
    if (matchingIds.length === 0) {
      return { items: [], total: 0 };
    }
    
    const items = await db
      .select()
      .from(learning)
      .where(inArray(learning.id, matchingIds))
      .orderBy(asc(learning.name))
      .limit(limit)
      .offset(offset);
    
    return { items, total: matchingIds.length };
  }
  
  // No search - get total count and paginated items
  const [{ total }] = await db.select({ total: count() }).from(learning);
  
  const items = await db
    .select()
    .from(learning)
    .orderBy(asc(learning.name))
    .limit(limit)
    .offset(offset);
  
  return { items, total };
}
