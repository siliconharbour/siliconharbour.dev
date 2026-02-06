import { db } from "~/db";
import {
  technologies,
  technologyAssignments,
  technologyCategories,
  companies,
  projects,
  type Technology,
  type NewTechnology,
  type TechnologyAssignment,
  type TechnologyCategory,
  type TechnologizedType,
} from "~/db/schema";
import { eq, asc, count, and, inArray } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";

// =============================================================================
// Technology CRUD
// =============================================================================

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: technologies.slug }).from(technologies);
  return rows.map((r) => r.slug);
}

export async function generateTechnologySlug(name: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(name);
  let existingSlugs = await getExistingSlugs();

  if (excludeId) {
    const current = await db
      .select({ slug: technologies.slug })
      .from(technologies)
      .where(eq(technologies.id, excludeId))
      .get();
    if (current) {
      existingSlugs = existingSlugs.filter((s) => s !== current.slug);
    }
  }

  return makeSlugUnique(baseSlug, existingSlugs);
}

export async function createTechnology(
  tech: Omit<NewTechnology, "slug">,
): Promise<Technology> {
  const slug = await generateTechnologySlug(tech.name);
  const [newTech] = await db
    .insert(technologies)
    .values({ ...tech, slug })
    .returning();
  return newTech;
}

export async function updateTechnology(
  id: number,
  tech: Partial<Omit<NewTechnology, "slug">>,
): Promise<Technology | null> {
  let updateData: Partial<NewTechnology> = { ...tech, updatedAt: new Date() };

  if (tech.name) {
    updateData.slug = await generateTechnologySlug(tech.name, id);
  }

  const [updated] = await db
    .update(technologies)
    .set(updateData)
    .where(eq(technologies.id, id))
    .returning();

  return updated ?? null;
}

export async function deleteTechnology(id: number): Promise<boolean> {
  // Assignments are cascade deleted due to FK constraint
  await db.delete(technologies).where(eq(technologies.id, id));
  return true;
}

export async function getTechnologyById(id: number): Promise<Technology | null> {
  return db.select().from(technologies).where(eq(technologies.id, id)).get() ?? null;
}

export async function getTechnologyBySlug(slug: string): Promise<Technology | null> {
  return db.select().from(technologies).where(eq(technologies.slug, slug)).get() ?? null;
}

export async function getTechnologyByName(name: string): Promise<Technology | null> {
  const all = await db.select().from(technologies);
  const nameLower = name.toLowerCase();
  return all.find((t) => t.name.toLowerCase() === nameLower) ?? null;
}

export async function getAllTechnologies(includeHidden: boolean = false): Promise<Technology[]> {
  if (includeHidden) {
    return db.select().from(technologies).orderBy(asc(technologies.name));
  }
  return db
    .select()
    .from(technologies)
    .where(eq(technologies.visible, true))
    .orderBy(asc(technologies.name));
}

export async function getTechnologiesByCategory(
  includeHidden: boolean = false,
): Promise<Record<TechnologyCategory, Technology[]>> {
  const allTechs = await getAllTechnologies(includeHidden);

  const byCategory: Record<TechnologyCategory, Technology[]> = {
    language: [],
    frontend: [],
    backend: [],
    cloud: [],
    database: [],
    devops: [],
    "games-and-graphics": [],
    mobile: [],
    "data-science": [],
    platform: [],
    specialized: [],
  };

  for (const tech of allTechs) {
    byCategory[tech.category].push(tech);
  }

  return byCategory;
}

export async function getTechnologiesCount(): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(technologies);
  return total;
}

// =============================================================================
// Technology Assignments
// =============================================================================

export async function assignTechnology(
  technologyId: number,
  contentType: TechnologizedType,
  contentId: number,
  provenance?: { source?: string; sourceUrl?: string; lastVerified?: string },
): Promise<TechnologyAssignment> {
  // Upsert - insert if not exists, otherwise ignore
  const existing = await db
    .select()
    .from(technologyAssignments)
    .where(
      and(
        eq(technologyAssignments.technologyId, technologyId),
        eq(technologyAssignments.contentType, contentType),
        eq(technologyAssignments.contentId, contentId),
      ),
    )
    .get();

  if (existing) {
    // Update provenance if provided
    if (provenance) {
      const [updated] = await db
        .update(technologyAssignments)
        .set({
          source: provenance.source ?? existing.source,
          sourceUrl: provenance.sourceUrl ?? existing.sourceUrl,
          lastVerified: provenance.lastVerified ?? existing.lastVerified,
        })
        .where(eq(technologyAssignments.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  const [newAssignment] = await db
    .insert(technologyAssignments)
    .values({
      technologyId,
      contentType,
      contentId,
      source: provenance?.source,
      sourceUrl: provenance?.sourceUrl,
      lastVerified: provenance?.lastVerified,
    })
    .returning();

  return newAssignment;
}

export async function unassignTechnology(
  technologyId: number,
  contentType: TechnologizedType,
  contentId: number,
): Promise<boolean> {
  await db
    .delete(technologyAssignments)
    .where(
      and(
        eq(technologyAssignments.technologyId, technologyId),
        eq(technologyAssignments.contentType, contentType),
        eq(technologyAssignments.contentId, contentId),
      ),
    );
  return true;
}

export async function setTechnologiesForContent(
  contentType: TechnologizedType,
  contentId: number,
  technologyIds: number[],
  provenance?: { source?: string; sourceUrl?: string; lastVerified?: string },
): Promise<void> {
  // Get current assignments
  const current = await db
    .select()
    .from(technologyAssignments)
    .where(
      and(
        eq(technologyAssignments.contentType, contentType),
        eq(technologyAssignments.contentId, contentId),
      ),
    );

  const currentIds = new Set(current.map((a) => a.technologyId));
  const newIds = new Set(technologyIds);

  // Remove technologies no longer assigned
  const toRemove = current.filter((a) => !newIds.has(a.technologyId));
  if (toRemove.length > 0) {
    await db.delete(technologyAssignments).where(
      inArray(
        technologyAssignments.id,
        toRemove.map((a) => a.id),
      ),
    );
  }

  // Add new technologies
  const toAdd = technologyIds.filter((id) => !currentIds.has(id));
  for (const techId of toAdd) {
    await assignTechnology(techId, contentType, contentId, provenance);
  }
}

export async function getTechnologiesForContent(
  contentType: TechnologizedType,
  contentId: number,
): Promise<(TechnologyAssignment & { technology: Technology })[]> {
  const assignments = await db
    .select()
    .from(technologyAssignments)
    .where(
      and(
        eq(technologyAssignments.contentType, contentType),
        eq(technologyAssignments.contentId, contentId),
      ),
    );

  const result: (TechnologyAssignment & { technology: Technology })[] = [];

  for (const assignment of assignments) {
    const tech = await getTechnologyById(assignment.technologyId);
    if (tech) {
      result.push({ ...assignment, technology: tech });
    }
  }

  return result.sort((a, b) => a.technology.name.localeCompare(b.technology.name));
}

// =============================================================================
// Queries for directory pages
// =============================================================================

export interface TechnologyWithUsage extends Technology {
  companyCount: number;
  projectCount: number;
  companyLogos: string[];
}

export async function getTechnologiesWithUsage(): Promise<TechnologyWithUsage[]> {
  const allTechs = await getAllTechnologies();

  const result: TechnologyWithUsage[] = [];

  for (const tech of allTechs) {
    const [companyResult] = await db
      .select({ count: count() })
      .from(technologyAssignments)
      .where(
        and(
          eq(technologyAssignments.technologyId, tech.id),
          eq(technologyAssignments.contentType, "company"),
        ),
      );

    const [projectResult] = await db
      .select({ count: count() })
      .from(technologyAssignments)
      .where(
        and(
          eq(technologyAssignments.technologyId, tech.id),
          eq(technologyAssignments.contentType, "project"),
        ),
      );

    // Get up to 3 company logos for preview
    const companyAssignments = await db
      .select({ contentId: technologyAssignments.contentId })
      .from(technologyAssignments)
      .where(
        and(
          eq(technologyAssignments.technologyId, tech.id),
          eq(technologyAssignments.contentType, "company"),
        ),
      )
      .limit(10);

    const companyLogos: string[] = [];
    for (const assignment of companyAssignments) {
      if (companyLogos.length >= 3) break;
      const company = await db
        .select({ logo: companies.logo })
        .from(companies)
        .where(and(eq(companies.id, assignment.contentId), eq(companies.visible, true)))
        .get();
      if (company?.logo) {
        companyLogos.push(company.logo);
      }
    }

    result.push({
      ...tech,
      companyCount: companyResult.count,
      projectCount: projectResult.count,
      companyLogos,
    });
  }

  return result;
}

export interface CompanyWithLogo {
  id: number;
  slug: string;
  name: string;
  logo: string | null;
}

export async function getCompaniesUsingTechnology(
  technologyId: number,
  limit?: number,
): Promise<CompanyWithLogo[]> {
  const assignments = await db
    .select()
    .from(technologyAssignments)
    .where(
      and(
        eq(technologyAssignments.technologyId, technologyId),
        eq(technologyAssignments.contentType, "company"),
      ),
    );

  const companyIds = assignments.map((a) => a.contentId);
  if (companyIds.length === 0) return [];

  let query = db
    .select({
      id: companies.id,
      slug: companies.slug,
      name: companies.name,
      logo: companies.logo,
    })
    .from(companies)
    .where(and(inArray(companies.id, companyIds), eq(companies.visible, true)))
    .orderBy(asc(companies.name));

  const results = await query;
  return limit ? results.slice(0, limit) : results;
}

export async function getProjectsUsingTechnology(technologyId: number): Promise<
  {
    id: number;
    slug: string;
    name: string;
    logo: string | null;
  }[]
> {
  const assignments = await db
    .select()
    .from(technologyAssignments)
    .where(
      and(
        eq(technologyAssignments.technologyId, technologyId),
        eq(technologyAssignments.contentType, "project"),
      ),
    );

  const projectIds = assignments.map((a) => a.contentId);
  if (projectIds.length === 0) return [];

  return db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      logo: projects.logo,
    })
    .from(projects)
    .where(inArray(projects.id, projectIds))
    .orderBy(asc(projects.name));
}

// Re-export from shared file for convenience
export { categoryLabels } from "./technology-categories";
export { technologyCategories };
