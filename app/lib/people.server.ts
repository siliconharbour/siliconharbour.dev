import { db } from "~/db";
import { people, type Person, type NewPerson } from "~/db/schema";
import { eq, desc } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";

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

export async function getAllPeople(): Promise<Person[]> {
  return db.select().from(people).orderBy(desc(people.createdAt));
}
