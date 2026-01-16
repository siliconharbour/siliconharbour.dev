import { db } from "~/db";
import { companies, type Company, type NewCompany } from "~/db/schema";
import { eq, desc, asc, count, inArray } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";
import { searchContentIds } from "./search.server";

export interface PaginatedCompanies {
  items: Company[];
  total: number;
}

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: companies.slug }).from(companies);
  return rows.map(r => r.slug);
}

export async function generateCompanySlug(name: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(name);
  let existingSlugs = await getExistingSlugs();
  
  if (excludeId) {
    const current = await db.select({ slug: companies.slug }).from(companies).where(eq(companies.id, excludeId)).get();
    if (current) {
      existingSlugs = existingSlugs.filter(s => s !== current.slug);
    }
  }
  
  return makeSlugUnique(baseSlug, existingSlugs);
}

export async function createCompany(company: Omit<NewCompany, "slug">): Promise<Company> {
  const slug = await generateCompanySlug(company.name);
  const [newCompany] = await db.insert(companies).values({ ...company, slug }).returning();
  
  await syncReferences("company", newCompany.id, newCompany.description);
  
  return newCompany;
}

export async function updateCompany(id: number, company: Partial<Omit<NewCompany, "slug">>): Promise<Company | null> {
  let updateData: Partial<NewCompany> = { ...company, updatedAt: new Date() };
  
  if (company.name) {
    updateData.slug = await generateCompanySlug(company.name, id);
  }
  
  const [updated] = await db
    .update(companies)
    .set(updateData)
    .where(eq(companies.id, id))
    .returning();

  if (!updated) return null;

  if (company.description) {
    await syncReferences("company", id, company.description);
  }

  return updated;
}

export async function deleteCompany(id: number): Promise<boolean> {
  const result = await db.delete(companies).where(eq(companies.id, id));
  return true;
}

export async function getCompanyById(id: number): Promise<Company | null> {
  return db.select().from(companies).where(eq(companies.id, id)).get() ?? null;
}

export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  return db.select().from(companies).where(eq(companies.slug, slug)).get() ?? null;
}

export async function getAllCompanies(): Promise<Company[]> {
  return db.select().from(companies).orderBy(asc(companies.name));
}

export async function getPaginatedCompanies(
  limit: number,
  offset: number,
  searchQuery?: string
): Promise<PaginatedCompanies> {
  // If searching, use FTS5
  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("company", searchQuery);
    
    if (matchingIds.length === 0) {
      return { items: [], total: 0 };
    }
    
    const items = await db
      .select()
      .from(companies)
      .where(inArray(companies.id, matchingIds))
      .orderBy(asc(companies.name))
      .limit(limit)
      .offset(offset);
    
    return { items, total: matchingIds.length };
  }
  
  // No search - get total count and paginated items
  const [{ total }] = await db.select({ total: count() }).from(companies);
  
  const items = await db
    .select()
    .from(companies)
    .orderBy(asc(companies.name))
    .limit(limit)
    .offset(offset);
  
  return { items, total };
}
