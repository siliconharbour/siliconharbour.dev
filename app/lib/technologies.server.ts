import { db } from "~/db";
import {
  technologies,
  technologyAssignments,
  technologyEvidence,
  technologyCategories,
  companies,
  jobs,
  jobTechnologyMentions,
  projects,
  type Technology,
  type NewTechnology,
  type TechnologyAssignment,
  type TechnologyCategory,
  type TechnologyEvidenceSourceType,
  type TechnologizedType,
} from "~/db/schema";
import { eq, asc, count, and, inArray } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { normalizeTechnologyEvidenceSourceLabel } from "./technology-evidence";

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
    "games-and-graphics": [],
    mobile: [],
    "data-science": [],
    llm: [],
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

export interface TechnologyProvenanceUpdate {
  technologyId: number;
  source: string | null;
  sourceUrl: string | null;
  lastVerified: string | null;
}

export interface TechnologyEvidenceUpdateGroup {
  technologyIds: number[];
  sourceType: TechnologyEvidenceSourceType;
  sourceUrl: string | null;
  lastVerified: string | null;
  jobIds: number[];
  excerptText: string | null;
}

export interface ApplyJobMentionTechInput {
  companyId: number;
  sourceId: number;
  selectedTechnologyIds: number[];
  sourceType: TechnologyEvidenceSourceType;
  sourceUrl: string | null;
  lastVerified: string | null;
}

export async function setTechnologyProvenanceForContent(
  contentType: TechnologizedType,
  contentId: number,
  updates: TechnologyProvenanceUpdate[],
): Promise<void> {
  for (const update of updates) {
    const existing = await db
      .select()
      .from(technologyAssignments)
      .where(
        and(
          eq(technologyAssignments.technologyId, update.technologyId),
          eq(technologyAssignments.contentType, contentType),
          eq(technologyAssignments.contentId, contentId),
        ),
      )
      .get();

    if (existing) {
      await db
        .update(technologyAssignments)
        .set({
          source: update.source,
          sourceUrl: update.sourceUrl,
          lastVerified: update.lastVerified,
        })
        .where(eq(technologyAssignments.id, existing.id));
      continue;
    }

    await db.insert(technologyAssignments).values({
      technologyId: update.technologyId,
      contentType,
      contentId,
      source: update.source,
      sourceUrl: update.sourceUrl,
      lastVerified: update.lastVerified,
    });
  }
}

export async function setTechnologyEvidenceForCompany(
  companyId: number,
  groups: TechnologyEvidenceUpdateGroup[],
): Promise<void> {
  const assignments = await db
    .select()
    .from(technologyAssignments)
    .where(
      and(
        eq(technologyAssignments.contentType, "company"),
        eq(technologyAssignments.contentId, companyId),
      ),
    );

  if (assignments.length === 0) {
    return;
  }

  const assignmentsByTechnologyId = new Map(assignments.map((assignment) => [assignment.technologyId, assignment]));
  const existingEvidence = await db
    .select()
    .from(technologyEvidence)
    .where(inArray(technologyEvidence.technologyAssignmentId, assignments.map((assignment) => assignment.id)));
  const existingExcerptByKey = new Map<string, string | null>();
  for (const evidence of existingEvidence) {
    const key = `${evidence.technologyAssignmentId}:${evidence.jobId ?? "none"}:${evidence.sourceType}`;
    if (!existingExcerptByKey.has(key)) {
      existingExcerptByKey.set(key, evidence.excerptText ?? null);
    }
  }

  await db
    .delete(technologyEvidence)
    .where(inArray(technologyEvidence.technologyAssignmentId, assignments.map((assignment) => assignment.id)));

  const allJobIds = Array.from(new Set(groups.flatMap((group) => group.jobIds)));
  const allTechnologyIds = Array.from(new Set(groups.flatMap((group) => group.technologyIds)));
  const mentionRows =
    allJobIds.length > 0 && allTechnologyIds.length > 0
      ? await db
          .select({
            jobId: jobTechnologyMentions.jobId,
            technologyId: jobTechnologyMentions.technologyId,
            confidence: jobTechnologyMentions.confidence,
            context: jobTechnologyMentions.context,
          })
          .from(jobTechnologyMentions)
          .where(
            and(
              inArray(jobTechnologyMentions.jobId, allJobIds),
              inArray(jobTechnologyMentions.technologyId, allTechnologyIds),
            ),
          )
      : [];
  const mentionContextByKey = new Map<string, { confidence: number | null; context: string | null }>();
  for (const mention of mentionRows) {
    const key = `${mention.jobId}:${mention.technologyId}`;
    const existing = mentionContextByKey.get(key);
    if (!existing || (mention.confidence ?? -1) > (existing.confidence ?? -1)) {
      mentionContextByKey.set(key, {
        confidence: mention.confidence ?? null,
        context: mention.context ?? null,
      });
    }
  }

  for (const group of groups) {
    for (const technologyId of group.technologyIds) {
      const assignment = assignmentsByTechnologyId.get(technologyId);
      if (!assignment) {
        continue;
      }

      if (group.jobIds.length > 0) {
        for (const jobId of group.jobIds) {
          const existingKey = `${assignment.id}:${jobId}:${group.sourceType}`;
          const existingExcerpt = existingExcerptByKey.get(existingKey) ?? null;
          const mention = mentionContextByKey.get(`${jobId}:${technologyId}`);
          const excerptForJobPosting =
            group.excerptText
            ?? existingExcerpt
            ?? mention?.context
            ?? null;
          const excerptForManual = group.excerptText ?? existingExcerpt ?? null;
          if (group.sourceType === "job_posting" && (!excerptForJobPosting || excerptForJobPosting.trim().length === 0)) {
            continue;
          }
          await db.insert(technologyEvidence).values({
            technologyAssignmentId: assignment.id,
            jobId,
            sourceType: group.sourceType,
            sourceUrl: group.sourceUrl,
            excerptText: group.sourceType === "job_posting" ? excerptForJobPosting : excerptForManual,
            lastVerified: group.lastVerified,
          });
        }
        continue;
      }

      const existingKey = `${assignment.id}:none:${group.sourceType}`;
      const existingExcerpt = existingExcerptByKey.get(existingKey) ?? null;
      await db.insert(technologyEvidence).values({
        technologyAssignmentId: assignment.id,
        sourceType: group.sourceType,
        sourceUrl: group.sourceUrl,
        excerptText: group.excerptText ?? existingExcerpt,
        lastVerified: group.lastVerified,
      });
    }
  }
}

export async function applyTechnologyEvidenceFromJobMentions(
  input: ApplyJobMentionTechInput,
): Promise<{ assignedCount: number; evidenceCreated: number; evidenceUpdated: number; skipped: number }> {
  if (input.selectedTechnologyIds.length === 0) {
    return { assignedCount: 0, evidenceCreated: 0, evidenceUpdated: 0, skipped: 0 };
  }

  const normalizedSourceLabel = normalizeTechnologyEvidenceSourceLabel(input.sourceType);
  const uniqueTechnologyIds = Array.from(new Set(input.selectedTechnologyIds));
  const assignments = await db
    .select()
    .from(technologyAssignments)
    .where(
      and(
        eq(technologyAssignments.contentType, "company"),
        eq(technologyAssignments.contentId, input.companyId),
      ),
    );

  const assignmentsByTechId = new Map(assignments.map((assignment) => [assignment.technologyId, assignment]));
  let assignedCount = 0;
  for (const technologyId of uniqueTechnologyIds) {
    const existing = assignmentsByTechId.get(technologyId);
    if (existing) {
      await db
        .update(technologyAssignments)
        .set({
          source: normalizedSourceLabel,
          sourceUrl: input.sourceUrl,
          lastVerified: input.lastVerified,
        })
        .where(eq(technologyAssignments.id, existing.id));
      continue;
    }

    const [created] = await db
      .insert(technologyAssignments)
      .values({
        technologyId,
        contentType: "company",
        contentId: input.companyId,
        source: normalizedSourceLabel,
        sourceUrl: input.sourceUrl,
        lastVerified: input.lastVerified,
      })
      .returning();
    assignmentsByTechId.set(technologyId, created);
    assignedCount++;
  }

  const mentionRows = await db
    .select({
      jobId: jobs.id,
      technologyId: jobTechnologyMentions.technologyId,
      context: jobTechnologyMentions.context,
    })
    .from(jobTechnologyMentions)
    .innerJoin(jobs, eq(jobTechnologyMentions.jobId, jobs.id))
    .where(
      and(
        eq(jobs.sourceId, input.sourceId),
        inArray(jobTechnologyMentions.technologyId, uniqueTechnologyIds),
      ),
    );

  let evidenceCreated = 0;
  let evidenceUpdated = 0;
  let skipped = 0;

  const existingEvidence = await db
    .select()
    .from(technologyEvidence)
    .where(
      inArray(
        technologyEvidence.technologyAssignmentId,
        Array.from(assignmentsByTechId.values()).map((assignment) => assignment.id),
      ),
    );

  const existingByAssignmentAndJob = new Map<string, (typeof existingEvidence)[number]>();
  for (const evidence of existingEvidence) {
    const key = `${evidence.technologyAssignmentId}:${evidence.jobId ?? "none"}:${evidence.sourceType}`;
    if (!existingByAssignmentAndJob.has(key)) {
      existingByAssignmentAndJob.set(key, evidence);
    }
  }

  for (const mention of mentionRows) {
    const assignment = assignmentsByTechId.get(mention.technologyId);
    if (!assignment) {
      skipped++;
      continue;
    }

    const key = `${assignment.id}:${mention.jobId}:${input.sourceType}`;
    const existing = existingByAssignmentAndJob.get(key);
    if (existing) {
      await db
        .update(technologyEvidence)
        .set({
          sourceUrl: input.sourceUrl,
          excerptText: mention.context ?? existing.excerptText,
          lastVerified: input.lastVerified,
        })
        .where(eq(technologyEvidence.id, existing.id));
      evidenceUpdated++;
      continue;
    }

    await db.insert(technologyEvidence).values({
      technologyAssignmentId: assignment.id,
      jobId: mention.jobId,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      excerptText: mention.context,
      lastVerified: input.lastVerified,
    });
    evidenceCreated++;
  }

  return { assignedCount, evidenceCreated, evidenceUpdated, skipped };
}

export interface TechnologyEvidenceWithJob {
  id: number;
  sourceType: TechnologyEvidenceSourceType;
  sourceUrl: string | null;
  excerptText: string | null;
  lastVerified: string | null;
  jobId: number | null;
  jobTitle: string | null;
  jobUrl: string | null;
  jobStatus: string | null;
}

export async function getTechnologiesForContent(
  contentType: TechnologizedType,
  contentId: number,
): Promise<(TechnologyAssignment & { technology: Technology; evidence: TechnologyEvidenceWithJob[] })[]> {
  const assignments = await db
    .select()
    .from(technologyAssignments)
    .where(
      and(
        eq(technologyAssignments.contentType, contentType),
        eq(technologyAssignments.contentId, contentId),
      ),
    );

  const assignmentIds = assignments.map((assignment) => assignment.id);
  const evidenceRows =
    assignmentIds.length > 0
      ? await db
          .select()
          .from(technologyEvidence)
          .where(inArray(technologyEvidence.technologyAssignmentId, assignmentIds))
      : [];

  const evidenceJobIds = Array.from(
    new Set(evidenceRows.map((evidence) => evidence.jobId).filter((jobId): jobId is number => jobId !== null)),
  );
  const evidenceJobs =
    evidenceJobIds.length > 0
      ? await db.select().from(jobs).where(inArray(jobs.id, evidenceJobIds))
      : [];
  const jobsById = new Map(evidenceJobs.map((job) => [job.id, job]));
  const evidenceByAssignmentId = new Map<number, TechnologyEvidenceWithJob[]>();

  for (const evidence of evidenceRows) {
    const job = evidence.jobId ? jobsById.get(evidence.jobId) : null;
    const list = evidenceByAssignmentId.get(evidence.technologyAssignmentId) ?? [];
    list.push({
      id: evidence.id,
      sourceType: evidence.sourceType,
      sourceUrl: evidence.sourceUrl,
      excerptText: evidence.excerptText,
      lastVerified: evidence.lastVerified,
      jobId: evidence.jobId,
      jobTitle: job?.title ?? null,
      jobUrl: job?.url ?? null,
      jobStatus: job?.status ?? null,
    });
    evidenceByAssignmentId.set(evidence.technologyAssignmentId, list);
  }

  const result: (TechnologyAssignment & { technology: Technology; evidence: TechnologyEvidenceWithJob[] })[] = [];

  for (const assignment of assignments) {
    const tech = await getTechnologyById(assignment.technologyId);
    if (tech) {
      result.push({
        ...assignment,
        technology: tech,
        evidence: evidenceByAssignmentId.get(assignment.id) ?? [],
      });
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
