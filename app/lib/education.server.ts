import { db } from "~/db";
import { education, companies, type Education, type NewEducation } from "~/db/schema";
import { eq, desc, asc, count, inArray, and } from "drizzle-orm";
import { syncReferences } from "./references.server";
import { searchContentIds } from "./search.server";
import { generateEntitySlug, getPaginatedBySearch } from "./crud-helpers.server";

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: education.slug }).from(education);
  return rows.map((r) => r.slug);
}

export async function generateEducationSlug(name: string, excludeId?: number): Promise<string> {
  return generateEntitySlug({
    name,
    excludeId,
    getExistingSlugs,
    getSlugForId: async (id) => {
      const current = await db
        .select({ slug: education.slug })
        .from(education)
        .where(eq(education.id, id))
        .get();
      return current?.slug ?? null;
    },
  });
}

export async function createEducation(item: Omit<NewEducation, "slug">): Promise<Education> {
  const slug = await generateEducationSlug(item.name);
  const [newItem] = await db
    .insert(education)
    .values({ ...item, slug })
    .returning();

  await syncReferences("education", newItem.id, newItem.description);

  return newItem;
}

export async function updateEducation(
  id: number,
  item: Partial<Omit<NewEducation, "slug">>,
): Promise<Education | null> {
  let updateData: Partial<NewEducation> = { ...item, updatedAt: new Date() };

  if (item.name) {
    updateData.slug = await generateEducationSlug(item.name, id);
  }

  const [updated] = await db
    .update(education)
    .set(updateData)
    .where(eq(education.id, id))
    .returning();

  if (!updated) return null;

  if (item.description) {
    await syncReferences("education", id, item.description);
  }

  return updated;
}

export async function deleteEducation(id: number): Promise<boolean> {
  await db.delete(education).where(eq(education.id, id));
  return true;
}

export async function getEducationById(id: number): Promise<Education | null> {
  return db.select().from(education).where(eq(education.id, id)).get() ?? null;
}

export async function getEducationBySlug(slug: string): Promise<Education | null> {
  return db.select().from(education).where(eq(education.slug, slug)).get() ?? null;
}

export async function getEducationByName(name: string): Promise<Education | null> {
  // Case-insensitive search by lowercasing both sides
  const all = await db.select().from(education);
  const nameLower = name.toLowerCase();
  return all.find((l) => l.name.toLowerCase() === nameLower) ?? null;
}

export async function getAllEducation(includeHidden: boolean = false): Promise<Education[]> {
  if (includeHidden) {
    return db.select().from(education).orderBy(desc(education.createdAt));
  }
  return db
    .select()
    .from(education)
    .where(eq(education.visible, true))
    .orderBy(desc(education.createdAt));
}

// =============================================================================
// Paginated queries with search
// =============================================================================

export interface PaginatedEducation {
  items: Education[];
  total: number;
}

export async function getPaginatedEducation(
  limit: number,
  offset: number,
  searchQuery?: string,
  includeHidden: boolean = false,
): Promise<PaginatedEducation> {
  const visibilityFilter = includeHidden ? undefined : eq(education.visible, true);
  return getPaginatedBySearch({
    searchQuery,
    getSearchIds: (query) => searchContentIds("education", query),
    getAllWhenNoSearch: async () => {
      const [{ total }] = await db.select({ total: count() }).from(education).where(visibilityFilter);
      const items = await db
        .select()
        .from(education)
        .where(visibilityFilter)
        .orderBy(asc(education.name))
        .limit(limit)
        .offset(offset);
      return { items, total };
    },
    getByIdsWhenSearch: async (matchingIds) => {
      const whereClause = visibilityFilter
        ? and(inArray(education.id, matchingIds), visibilityFilter)
        : inArray(education.id, matchingIds);
      const items = await db
        .select()
        .from(education)
        .where(whereClause)
        .orderBy(asc(education.name))
        .limit(limit)
        .offset(offset);
      const allMatching = await db.select({ id: education.id }).from(education).where(whereClause);
      return { items, total: allMatching.length };
    },
  });
}

// =============================================================================
// Company to Education conversion
// =============================================================================

/**
 * Convert a company to an educational institution.
 * Creates the education entry, deletes the company, and updates references.
 */
export async function convertCompanyToEducation(
  companyId: number,
  type: "university" | "college" | "bootcamp" | "online" | "other" = "other",
): Promise<Education> {
  // Get the company
  const company = await db.select().from(companies).where(eq(companies.id, companyId)).get();
  if (!company) {
    throw new Error("Company not found");
  }

  // Generate a unique slug for education (might differ if there's a collision)
  const slug = await generateEducationSlug(company.name);

  // Create the education entry with company data
  const [newInstitution] = await db
    .insert(education)
    .values({
      slug,
      name: company.name,
      description: company.description,
      website: company.website,
      type,
      logo: company.logo,
      coverImage: company.coverImage,
      technl: company.technl,
      genesis: company.genesis,
    })
    .returning();

  // Sync references for the new education entry
  await syncReferences("education", newInstitution.id, newInstitution.description);

  // Delete the company (this will cascade delete its references)
  await db.delete(companies).where(eq(companies.id, companyId));

  return newInstitution;
}
