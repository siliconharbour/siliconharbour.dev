import { db } from "~/db";
import { 
  projects, 
  projectImages,
  type Project, 
  type NewProject,
  type ProjectImage,
  type NewProjectImage,
} from "~/db/schema";
import { eq, desc, asc, count, inArray } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";
import { searchContentIds } from "./search.server";

// =============================================================================
// Slug generation
// =============================================================================

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: projects.slug }).from(projects);
  return rows.map(r => r.slug);
}

export async function generateProjectSlug(name: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(name);
  let existingSlugs = await getExistingSlugs();
  
  if (excludeId) {
    const current = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, excludeId)).get();
    if (current) {
      existingSlugs = existingSlugs.filter(s => s !== current.slug);
    }
  }
  
  return makeSlugUnique(baseSlug, existingSlugs);
}

// =============================================================================
// Project CRUD
// =============================================================================

export async function createProject(project: Omit<NewProject, "slug">): Promise<Project> {
  const slug = await generateProjectSlug(project.name);
  const [newProject] = await db.insert(projects).values({ ...project, slug }).returning();
  
  await syncReferences("project", newProject.id, newProject.description);
  
  return newProject;
}

export async function updateProject(id: number, project: Partial<Omit<NewProject, "slug">>): Promise<Project | null> {
  let updateData: Partial<NewProject> = { ...project, updatedAt: new Date() };
  
  if (project.name) {
    updateData.slug = await generateProjectSlug(project.name, id);
  }
  
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
  await db.delete(projects).where(eq(projects.id, id));
  return true;
}

export async function getProjectById(id: number): Promise<Project | null> {
  return db.select().from(projects).where(eq(projects.id, id)).get() ?? null;
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  return db.select().from(projects).where(eq(projects.slug, slug)).get() ?? null;
}

export async function getAllProjects(): Promise<Project[]> {
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}

// =============================================================================
// Project Images (Gallery)
// =============================================================================

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
  sortOrder?: number
): Promise<ProjectImage> {
  // If no sort order specified, put at the end
  if (sortOrder === undefined) {
    const existing = await getProjectImages(projectId);
    sortOrder = existing.length > 0 
      ? Math.max(...existing.map(i => i.sortOrder)) + 1 
      : 0;
  }
  
  const [newImage] = await db
    .insert(projectImages)
    .values({ 
      projectId, 
      image, 
      caption: caption || null, 
      sortOrder 
    })
    .returning();
  
  return newImage;
}

export async function updateProjectImage(
  imageId: number,
  data: { caption?: string | null; sortOrder?: number }
): Promise<ProjectImage | null> {
  const [updated] = await db
    .update(projectImages)
    .set(data)
    .where(eq(projectImages.id, imageId))
    .returning();
  
  return updated ?? null;
}

export async function removeProjectImage(imageId: number): Promise<boolean> {
  await db.delete(projectImages).where(eq(projectImages.id, imageId));
  return true;
}

export async function reorderProjectImages(projectId: number, imageIds: number[]): Promise<void> {
  // Update each image's sort order based on its position in the array
  for (let i = 0; i < imageIds.length; i++) {
    await db
      .update(projectImages)
      .set({ sortOrder: i })
      .where(eq(projectImages.id, imageIds[i]));
  }
}

// =============================================================================
// Project with images helper
// =============================================================================

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

// =============================================================================
// Paginated queries with search
// =============================================================================

export interface PaginatedProjects {
  items: Project[];
  total: number;
}

export async function getPaginatedProjects(
  limit: number,
  offset: number,
  searchQuery?: string
): Promise<PaginatedProjects> {
  // If searching, use FTS5
  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("project", searchQuery);
    
    if (matchingIds.length === 0) {
      return { items: [], total: 0 };
    }
    
    const items = await db
      .select()
      .from(projects)
      .where(inArray(projects.id, matchingIds))
      .orderBy(desc(projects.createdAt))
      .limit(limit)
      .offset(offset);
    
    return { items, total: matchingIds.length };
  }
  
  // No search - get total count and paginated items
  const [{ total }] = await db.select({ total: count() }).from(projects);
  
  const items = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt))
    .limit(limit)
    .offset(offset);
  
  return { items, total };
}

// Re-export from shared module
export { parseProjectLinks, stringifyProjectLinks, type ProjectLinks } from "./project-links";
