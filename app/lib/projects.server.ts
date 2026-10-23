import { compactLinks, type ProjectLinks, type LinkPatch } from "./links";
import { patchLinks } from "./link-patch.server";
import { deleteUnreferencedImages } from "./entity-images.server";
import { db } from "~/db";
import {
  projects,
  projectImages,
  type Project,
  type NewProject,
  type ProjectImage,
} from "~/db/schema";
import { eq, asc, count, inArray, isNotNull } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";
import { searchContentIds, searchRankOrder } from "./search.server";

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: projects.slug }).from(projects);
  return rows.map((r) => r.slug);
}

export async function generateProjectSlug(name: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(name);
  let existingSlugs = await getExistingSlugs();

  if (excludeId) {
    const current = await db
      .select({ slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, excludeId))
      .get();
    if (current) {
      existingSlugs = existingSlugs.filter((s) => s !== current.slug);
    }
  }

  return makeSlugUnique(baseSlug, existingSlugs);
}

export async function createProject(
  project: Omit<NewProject, "slug" | "links"> & { links?: LinkPatch<ProjectLinks> },
): Promise<Project> {
  const slug = await generateProjectSlug(project.name);
  const [newProject] = await db
    .insert(projects)
    .values({
      ...project,
      slug,
      links: project.links === undefined ? undefined : compactLinks<ProjectLinks>(project.links),
    })
    .returning();

  await syncReferences("project", newProject.id, newProject.description);

  return newProject;
}

export async function updateProject(
  id: number,
  project: Partial<Omit<NewProject, "slug" | "links">> & { links?: LinkPatch<ProjectLinks> },
): Promise<Project | null> {
  const { links, ...fields } = project;
  const updateData = {
    ...fields,
    updatedAt: new Date(),
    slug: project.name ? await generateProjectSlug(project.name, id) : undefined,
    ...(links !== undefined && { links: patchLinks(projects.links, links) }),
  };

  const [updated] = await db
    .update(projects)
    .set(updateData)
    .where(eq(projects.id, id))
    .returning();

  if (!updated) return null;

  if (project.description) {
    await syncReferences("project", id, project.description);
  }

  return updated;
}

export async function deleteProject(id: number): Promise<boolean> {
  const record = await getProjectById(id);
  if (!record) return false;
  const gallery = await getProjectImages(id);
  await db.delete(projects).where(eq(projects.id, id));
  await deleteUnreferencedImages([
    record.logo,
    record.coverImage,
    ...gallery.map((image) => image.image),
  ]);
  return true;
}

export async function getProjectById(id: number): Promise<Project | null> {
  return db.select().from(projects).where(eq(projects.id, id)).get() ?? null;
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  return db.select().from(projects).where(eq(projects.slug, slug)).get() ?? null;
}

export async function getAllProjects(): Promise<Project[]> {
  return db.select().from(projects).orderBy(asc(projects.name));
}

/**
 * Get a deterministic "random" selection of projects based on a daily seed.
 * Only returns projects that have logos for better visual presentation.
 * The same seed will always return the same projects in the same order.
 */
export async function getRandomProjects(count: number, seed?: number): Promise<Project[]> {
  const dateSeed = seed ?? parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ""), 10);

  const allProjects = await db.select().from(projects).where(isNotNull(projects.logo));

  if (allProjects.length <= count) {
    return allProjects;
  }

  // Knuth multiplicative hash for good distribution
  const shuffled = allProjects
    .map((p) => ({
      project: p,
      hash: ((p.id + dateSeed) * 2654435761) >>> 0, // unsigned 32-bit
    }))
    .sort((a, b) => a.hash - b.hash)
    .slice(0, count)
    .map((x) => x.project);

  return shuffled;
}

export async function getProjectImages(projectId: number): Promise<ProjectImage[]> {
  return db
    .select()
    .from(projectImages)
    .where(eq(projectImages.projectId, projectId))
    .orderBy(asc(projectImages.sortOrder), asc(projectImages.id));
}

export async function addProjectImage(
  projectId: number,
  image: string,
  caption?: string | null,
  sortOrder?: number,
): Promise<ProjectImage> {
  if (sortOrder === undefined) {
    const existing = await getProjectImages(projectId);
    sortOrder = existing.length > 0 ? Math.max(...existing.map((i) => i.sortOrder)) + 1 : 0;
  }

  const [newImage] = await db
    .insert(projectImages)
    .values({
      projectId,
      image,
      caption: caption || null,
      sortOrder,
    })
    .returning();

  return newImage;
}

export async function updateProjectImage(
  imageId: number,
  data: { caption?: string | null; sortOrder?: number },
): Promise<ProjectImage | null> {
  const [updated] = await db
    .update(projectImages)
    .set(data)
    .where(eq(projectImages.id, imageId))
    .returning();

  return updated ?? null;
}

export async function removeProjectImage(imageId: number): Promise<boolean> {
  const image = await db.select().from(projectImages).where(eq(projectImages.id, imageId)).get();
  if (!image) return false;
  await db.delete(projectImages).where(eq(projectImages.id, imageId));
  await deleteUnreferencedImages([image.image]);
  return true;
}

export async function reorderProjectImages(projectId: number, imageIds: number[]): Promise<void> {
  for (let i = 0; i < imageIds.length; i++) {
    await db.update(projectImages).set({ sortOrder: i }).where(eq(projectImages.id, imageIds[i]));
  }
}

export type ProjectWithImages = Project & { images: ProjectImage[] };

export async function getProjectWithImages(id: number): Promise<ProjectWithImages | null> {
  const project = await getProjectById(id);
  if (!project) return null;

  const images = await getProjectImages(id);
  return { ...project, images };
}

export async function getProjectBySlugWithImages(slug: string): Promise<ProjectWithImages | null> {
  const project = await getProjectBySlug(slug);
  if (!project) return null;

  const images = await getProjectImages(project.id);
  return { ...project, images };
}

export interface PaginatedProjects {
  items: Project[];
  total: number;
}

export async function getPaginatedProjects(
  limit: number,
  offset: number,
  searchQuery?: string,
): Promise<PaginatedProjects> {
  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("project", searchQuery);

    if (matchingIds.length === 0) {
      return { items: [], total: 0 };
    }

    const items = await db
      .select()
      .from(projects)
      .where(inArray(projects.id, matchingIds))
      .orderBy(searchRankOrder(projects.id, matchingIds))
      .limit(limit)
      .offset(offset);

    return { items, total: matchingIds.length };
  }

  const [{ total }] = await db.select({ total: count() }).from(projects);

  const items = await db
    .select()
    .from(projects)
    .orderBy(asc(projects.name))
    .limit(limit)
    .offset(offset);

  return { items, total };
}
