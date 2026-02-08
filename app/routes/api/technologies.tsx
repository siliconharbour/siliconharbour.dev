import type { Route } from "./+types/technologies";
import { db } from "~/db";
import { technologies } from "~/db/schema";
import { asc, count, eq } from "drizzle-orm";
import {
  parsePagination,
  paginatedJsonResponse,
  imageUrl,
  contentUrl,
} from "~/lib/api.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePagination(url);

  // Get total count (only visible)
  const [{ total }] = await db
    .select({ total: count() })
    .from(technologies)
    .where(eq(technologies.visible, true));

  // Get paginated data (only visible)
  const data = await db
    .select()
    .from(technologies)
    .where(eq(technologies.visible, true))
    .orderBy(asc(technologies.name))
    .limit(limit)
    .offset(offset);

  // Transform data for API response
  const items = data.map((tech) => ({
    id: tech.id,
    slug: tech.slug,
    name: tech.name,
    category: tech.category,
    description: tech.description,
    website: tech.website,
    icon: imageUrl(tech.icon),
    url: contentUrl("directory/technologies", tech.slug),
    createdAt: tech.createdAt.toISOString(),
    updatedAt: tech.updatedAt.toISOString(),
  }));

  return paginatedJsonResponse(url, items, { total, limit, offset });
}
