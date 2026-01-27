import type { Route } from "./+types/companies";
import { db } from "~/db";
import { companies } from "~/db/schema";
import { asc, count, eq } from "drizzle-orm";
import {
  parsePagination,
  buildLinkHeader,
  jsonResponse,
  imageUrl,
  contentUrl,
} from "~/lib/api.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePagination(url);

  // Get total count (only visible)
  const [{ total }] = await db
    .select({ total: count() })
    .from(companies)
    .where(eq(companies.visible, true));

  // Get paginated data (only visible)
  const data = await db
    .select()
    .from(companies)
    .where(eq(companies.visible, true))
    .orderBy(asc(companies.name))
    .limit(limit)
    .offset(offset);

  // Transform data for API response
  const items = data.map((company) => ({
    id: company.id,
    slug: company.slug,
    name: company.name,
    description: company.description,
    website: company.website,
    location: company.location,
    founded: company.founded,
    logo: imageUrl(company.logo),
    coverImage: imageUrl(company.coverImage),
    url: contentUrl("companies", company.slug),
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  }));

  const baseUrl = url.origin + url.pathname;
  const linkHeader = buildLinkHeader(baseUrl, { limit, offset }, total);

  return jsonResponse(
    {
      data: items,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    },
    { linkHeader },
  );
}
