import type { Route } from "./+types/technologies.$slug";
import { db } from "~/db";
import { technologies, technologyAssignments, companies, projects } from "~/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { jsonResponse, imageUrl, contentUrl, notFoundResponse } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const [technology] = await db
    .select()
    .from(technologies)
    .where(eq(technologies.slug, params.slug));

  if (!technology) {
    return notFoundResponse("Technology not found");
  }

  // Get companies using this technology
  const companyAssignments = await db
    .select({ contentId: technologyAssignments.contentId })
    .from(technologyAssignments)
    .where(
      and(
        eq(technologyAssignments.technologyId, technology.id),
        eq(technologyAssignments.contentType, "company"),
      ),
    );

  const companyIds = companyAssignments.map((a) => a.contentId);
  let companyList: { id: number; slug: string; name: string }[] = [];

  if (companyIds.length > 0) {
    companyList = await db
      .select({ id: companies.id, slug: companies.slug, name: companies.name })
      .from(companies)
      .where(and(inArray(companies.id, companyIds), eq(companies.visible, true)))
      .orderBy(asc(companies.name));
  }

  // Get projects using this technology
  const projectAssignments = await db
    .select({ contentId: technologyAssignments.contentId })
    .from(technologyAssignments)
    .where(
      and(
        eq(technologyAssignments.technologyId, technology.id),
        eq(technologyAssignments.contentType, "project"),
      ),
    );

  const projectIds = projectAssignments.map((a) => a.contentId);
  let projectList: { id: number; slug: string; name: string }[] = [];

  if (projectIds.length > 0) {
    projectList = await db
      .select({ id: projects.id, slug: projects.slug, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, projectIds))
      .orderBy(asc(projects.name));
  }

  return jsonResponse({
    id: technology.id,
    slug: technology.slug,
    name: technology.name,
    category: technology.category,
    description: technology.description,
    website: technology.website,
    icon: imageUrl(technology.icon),
    url: contentUrl("directory/technologies", technology.slug),
    createdAt: technology.createdAt.toISOString(),
    updatedAt: technology.updatedAt.toISOString(),
    companies: companyList.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      url: contentUrl("directory/companies", c.slug),
    })),
    projects: projectList.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      url: contentUrl("directory/projects", p.slug),
    })),
  });
}
