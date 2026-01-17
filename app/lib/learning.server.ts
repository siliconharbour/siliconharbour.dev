import { db } from "~/db";
import { learning, companies, type Learning, type NewLearning } from "~/db/schema";
import { eq, desc, asc, count, inArray, and } from "drizzle-orm";
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

export async function getAllLearning(includeHidden: boolean = false): Promise<Learning[]> {
  if (includeHidden) {
    return db.select().from(learning).orderBy(desc(learning.createdAt));
  }
  return db.select().from(learning).where(eq(learning.visible, true)).orderBy(desc(learning.createdAt));
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
  searchQuery?: string,
  includeHidden: boolean = false
): Promise<PaginatedLearning> {
  const visibilityFilter = includeHidden ? undefined : eq(learning.visible, true);
  
  // If searching, use FTS5
  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("learning", searchQuery);
    
    if (matchingIds.length === 0) {
      return { items: [], total: 0 };
    }
    
    const whereClause = visibilityFilter
      ? and(inArray(learning.id, matchingIds), visibilityFilter)
      : inArray(learning.id, matchingIds);
    
    const items = await db
      .select()
      .from(learning)
      .where(whereClause)
      .orderBy(asc(learning.name))
      .limit(limit)
      .offset(offset);
    
    const allMatching = await db
      .select({ id: learning.id })
      .from(learning)
      .where(whereClause);
    
    return { items, total: allMatching.length };
  }
  
  // No search - get total count and paginated items
  const [{ total }] = await db
    .select({ total: count() })
    .from(learning)
    .where(visibilityFilter);
  
  const items = await db
    .select()
    .from(learning)
    .where(visibilityFilter)
    .orderBy(asc(learning.name))
    .limit(limit)
    .offset(offset);
  
  return { items, total };
}

// =============================================================================
// Company to Learning conversion
// =============================================================================

/**
 * Convert a company to a learning institution.
 * Creates the learning entry, deletes the company, and updates references.
 */
export async function convertCompanyToLearning(
  companyId: number, 
  type: "university" | "college" | "bootcamp" | "online" | "other" = "other"
): Promise<Learning> {
  // Get the company
  const company = await db.select().from(companies).where(eq(companies.id, companyId)).get();
  if (!company) {
    throw new Error("Company not found");
  }
  
  // Generate a unique slug for learning (might differ if there's a collision)
  const slug = await generateLearningSlug(company.name);
  
  // Create the learning entry with company data
  const [newInstitution] = await db.insert(learning).values({
    slug,
    name: company.name,
    description: company.description,
    website: company.website,
    type,
    logo: company.logo,
    coverImage: company.coverImage,
    technl: company.technl,
    genesis: company.genesis,
  }).returning();
  
  // Sync references for the new learning entry
  await syncReferences("learning", newInstitution.id, newInstitution.description);
  
  // Delete the company (this will cascade delete its references)
  await db.delete(companies).where(eq(companies.id, companyId));
  
  return newInstitution;
}
