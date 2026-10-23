import { references as contentReferences } from "~/db/schema";
import { notRejected, assertDirectoryIdentityAvailable } from "./directory-active.server";
import { githubLogin } from "./url-fields";
import { compactLinks, type SocialLinks, type LinkPatch } from "./links";
import { patchLinks } from "./link-patch.server";
import { deleteUnreferencedImages } from "./entity-images.server";
import { db } from "~/db";
import { people, type Person, type NewPerson } from "~/db/schema";
import { eq, or, desc, asc, count, inArray, and, sql } from "drizzle-orm";
import { syncReferences } from "./references.server";
import { searchContentIds, searchRankOrder } from "./search.server";
import { generateEntitySlug, getPaginatedBySearch } from "./crud-helpers.server";

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: people.slug }).from(people);
  return rows.map((r) => r.slug);
}

export async function generatePersonSlug(name: string, excludeId?: number): Promise<string> {
  return generateEntitySlug({
    name,
    excludeId,
    getExistingSlugs,
    getSlugForId: async (id) => {
      const current = await db
        .select({ slug: people.slug })
        .from(people)
        .where(and(notRejected("person", people.id), eq(people.id, id)))
        .get();
      return current?.slug ?? null;
    },
  });
}

export async function createPerson(
  person: Omit<NewPerson, "slug" | "socialLinks"> & { socialLinks?: LinkPatch<SocialLinks> },
): Promise<Person> {
  assertDirectoryIdentityAvailable("person", person);
  const slug = await generatePersonSlug(person.name);
  const [newPerson] = await db
    .insert(people)
    .values({
      ...person,
      slug,
      socialLinks:
        person.socialLinks === undefined
          ? undefined
          : compactLinks<SocialLinks>(person.socialLinks),
    })
    .returning();

  await syncReferences("person", newPerson.id, newPerson.bio);

  return newPerson;
}

export async function updatePerson(
  id: number,
  person: Partial<Omit<NewPerson, "slug" | "socialLinks">> & {
    socialLinks?: LinkPatch<SocialLinks>;
  },
): Promise<Person | null> {
  const { socialLinks, ...fields } = person;
  const updateData = {
    ...fields,
    updatedAt: new Date(),
    slug: person.name ? await generatePersonSlug(person.name, id) : undefined,
    ...(socialLinks !== undefined && { socialLinks: patchLinks(people.socialLinks, socialLinks) }),
  };

  const [updated] = await db
    .update(people)
    .set(updateData)
    .where(and(notRejected("person", people.id), eq(people.id, id)))
    .returning();

  if (!updated) return null;

  if (person.bio !== undefined) {
    await syncReferences("person", id, person.bio);
  }

  return updated;
}

export async function deletePerson(id: number, includeRejected = false): Promise<boolean> {
  const record = includeRejected
    ? db.select().from(people).where(eq(people.id, id)).get()
    : await getPersonById(id);
  if (!record) return false;

  db.transaction(() => {
    db.delete(contentReferences)
      .where(
        or(
          and(eq(contentReferences.sourceType, "person"), eq(contentReferences.sourceId, id)),
          and(eq(contentReferences.targetType, "person"), eq(contentReferences.targetId, id)),
        ),
      )
      .run();
    db.delete(people).where(eq(people.id, id)).run();
  });
  await deleteUnreferencedImages([record.avatar]);
  return true;
}

export async function getPersonById(id: number): Promise<Person | null> {
  return (
    db
      .select()
      .from(people)
      .where(and(notRejected("person", people.id), eq(people.id, id)))
      .get() ?? null
  );
}

export async function getPersonBySlug(slug: string): Promise<Person | null> {
  return (
    db
      .select()
      .from(people)
      .where(and(notRejected("person", people.id), eq(people.slug, slug)))
      .get() ?? null
  );
}

export async function getPersonByName(name: string): Promise<Person | null> {
  const result = await db
    .select()
    .from(people)
    .where(
      and(notRejected("person", people.id), sql`LOWER(${people.name}) = LOWER(${name.trim()})`),
    )
    .limit(1);
  return result[0] ?? null;
}

export async function getPersonByGitHub(githubUrl: string): Promise<Person | null> {
  const result = await db
    .select()
    .from(people)
    .where(
      and(
        notRejected("person", people.id),
        sql`LOWER(${people.github}) = LOWER(${`https://github.com/${githubLogin(githubUrl)}`})`,
      ),
    )
    .limit(1);
  return result[0] ?? null;
}

export async function getAllPeople(includeHidden: boolean = false): Promise<Person[]> {
  if (includeHidden) {
    return db
      .select()
      .from(people)
      .where(notRejected("person", people.id))
      .orderBy(desc(people.createdAt));
  }
  return db
    .select()
    .from(people)
    .where(and(notRejected("person", people.id), eq(people.visible, true)))
    .orderBy(desc(people.createdAt));
}

export async function getHiddenPeople(): Promise<Person[]> {
  return db
    .select()
    .from(people)
    .where(and(notRejected("person", people.id), eq(people.visible, false)))
    .orderBy(desc(people.createdAt));
}

export async function hideAllVisiblePeople(): Promise<number> {
  const result = await db
    .update(people)
    .set({ visible: false, updatedAt: new Date() })
    .where(and(notRejected("person", people.id), eq(people.visible, true)));
  return result.changes;
}

export interface PaginatedPeople {
  items: Person[];
  total: number;
}

export async function getPaginatedPeople(
  limit: number,
  offset: number,
  searchQuery?: string,
  includeHidden: boolean = false,
): Promise<PaginatedPeople> {
  const visibilityFilter = includeHidden ? undefined : eq(people.visible, true);
  return getPaginatedBySearch({
    searchQuery,
    getSearchIds: (query) => searchContentIds("person", query),
    getAllWhenNoSearch: async () => {
      const [{ total }] = await db
        .select({ total: count() })
        .from(people)
        .where(and(notRejected("person", people.id), visibilityFilter));
      const items = await db
        .select()
        .from(people)
        .where(and(notRejected("person", people.id), visibilityFilter))
        .orderBy(asc(people.name))
        .limit(limit)
        .offset(offset);
      return { items, total };
    },
    getByIdsWhenSearch: async (matchingIds) => {
      const whereClause = visibilityFilter
        ? and(inArray(people.id, matchingIds), visibilityFilter)
        : inArray(people.id, matchingIds);
      const items = await db
        .select()
        .from(people)
        .where(and(notRejected("person", people.id), whereClause))
        .orderBy(searchRankOrder(people.id, matchingIds))
        .limit(limit)
        .offset(offset);
      const [{ total }] = await db
        .select({ total: count() })
        .from(people)
        .where(and(notRejected("person", people.id), whereClause));
      return { items, total };
    },
  });
}
