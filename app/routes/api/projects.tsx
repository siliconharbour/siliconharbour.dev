import type { Route } from "./+types/projects";
import { db } from "~/db";
import { projects } from "~/db/schema";
import { asc, count } from "drizzle-orm";
import { parsePagination, buildLinkHeader, jsonResponse, imageUrl, contentUrl } from "~/lib/api.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePagination(url);
  
  const [{ total }] = await db.select({ total: count() }).from(projects);
  
  const data = await db
    .select()
    .from(projects)
    .orderBy(asc(projects.name))
    .limit(limit)
    .offset(offset);
  
  const items = data.map(project => ({
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description,
    type: project.type,
    status: project.status,
    links: project.links ? JSON.parse(project.links) : null,
    logo: imageUrl(project.logo),
    coverImage: imageUrl(project.coverImage),
    url: contentUrl("projects", project.slug),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }));
  
  const baseUrl = url.origin + url.pathname;
  const linkHeader = buildLinkHeader(baseUrl, { limit, offset }, total);
  
  return jsonResponse({
    data: items,
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  }, { linkHeader });
}
