import { db } from "~/db";
import { people, type Person, type NewPerson } from "~/db/schema";
import { eq, desc, asc, count, inArray, and } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";
import { searchContentIds } from "./search.server";

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: people.slug }).from(people);
  return rows.map(r => r.slug);
}

export async function generatePersonSlug(name: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(name);
  let existingSlugs = await getExistingSlugs();
  
  if (excludeId) {
    const current = await db.select({ slug: people.slug }).from(people).where(eq(people.id, excludeId)).get();
    if (current) {
      existingSlugs = existingSlugs.filter(s => s !== current.slug);
    }
  }
  
  return makeSlugUnique(baseSlug, existingSlugs);
}

export async function createPerson(person: Omit<NewPerson, "slug">): Promise<Person> {
  const slug = await generatePersonSlug(person.name);
  const [newPerson] = await db.insert(people).values({ ...person, slug }).returning();
  
  await syncReferences("person", newPerson.id, newPerson.bio);
  
  return newPerson;
}

export async function updatePerson(id: number, person: Partial<Omit<NewPerson, "slug">>): Promise<Person | null> {
  let updateData: Partial<NewPerson> = { ...person, updatedAt: new Date() };
  
  if (person.name) {
    updateData.slug = await generatePersonSlug(person.name, id);
  }
  
  const [updated] = await db
    .update(people)
    .set(updateData)
    .where(eq(people.id, id))
    .returning();

  if (!updated) return null;

  if (person.bio) {
    await syncReferences("person", id, person.bio);
  }

  return updated;
}

export async function deletePerson(id: number): Promise<boolean> {
  await db.delete(people).where(eq(people.id, id));
  return true;
}

export async function getPersonById(id: number): Promise<Person | null> {
  return db.select().from(people).where(eq(people.id, id)).get() ?? null;
}

export async function getPersonBySlug(slug: string): Promise<Person | null> {
  return db.select().from(people).where(eq(people.slug, slug)).get() ?? null;
}

export async function getPersonByName(name: string): Promise<Person | null> {
  // Case-insensitive search by lowercasing both sides
  const all = await db.select().from(people);
  const nameLower = name.toLowerCase();
  return all.find(p => p.name.toLowerCase() === nameLower) ?? null;
}

export async function getPersonByGitHub(githubUrl: string): Promise<Person | null> {
  // Find by GitHub URL
  const all = await db.select().from(people);
  const urlLower = githubUrl.toLowerCase();
  return all.find(p => p.github?.toLowerCase() === urlLower) ?? null;
}

export async function getAllPeople(includeHidden: boolean = false): Promise<Person[]> {
  if (includeHidden) {
    return db.select().from(people).orderBy(desc(people.createdAt));
  }
  return db.select().from(people).where(eq(people.visible, true)).orderBy(desc(people.createdAt));
}

export async function getHiddenPeople(): Promise<Person[]> {
  return db.select().from(people).where(eq(people.visible, false)).orderBy(desc(people.createdAt));
}

export async function getHiddenPeopleCount(): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(people).where(eq(people.visible, false));
  return total;
}

export async function getVisiblePeopleCount(): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(people).where(eq(people.visible, true));
  return total;
}

export async function hideAllVisiblePeople(): Promise<number> {
  const result = await db
    .update(people)
    .set({ visible: false, updatedAt: new Date() })
    .where(eq(people.visible, true));
  return result.changes;
}

// =============================================================================
// Paginated queries with search
// =============================================================================

export interface PaginatedPeople {
  items: Person[];
  total: number;
}

export async function getPaginatedPeople(
  limit: number,
  offset: number,
  searchQuery?: string,
  includeHidden: boolean = false
): Promise<PaginatedPeople> {
  const visibilityFilter = includeHidden ? undefined : eq(people.visible, true);
  
  // If searching, use FTS5
  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("person", searchQuery);
    
    if (matchingIds.length === 0) {
      return { items: [], total: 0 };
    }
    
    const whereClause = visibilityFilter 
      ? and(inArray(people.id, matchingIds), visibilityFilter)
      : inArray(people.id, matchingIds);
    
    const items = await db
      .select()
      .from(people)
      .where(whereClause)
      .orderBy(asc(people.name))
      .limit(limit)
      .offset(offset);
    
    // Get accurate count with visibility filter
    const allMatching = await db
      .select({ id: people.id })
      .from(people)
      .where(whereClause);
    
    return { items, total: allMatching.length };
  }
  
  // No search - get total count and paginated items
  const [{ total }] = await db
    .select({ total: count() })
    .from(people)
    .where(visibilityFilter);
  
  const items = await db
    .select()
    .from(people)
    .where(visibilityFilter)
    .orderBy(asc(people.name))
    .limit(limit)
    .offset(offset);
  
  return { items, total };
}
