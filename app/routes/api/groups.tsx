import type { Route } from "./+types/groups";
import { db } from "~/db";
import { groups } from "~/db/schema";
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

  const [{ total }] = await db
    .select({ total: count() })
    .from(groups)
    .where(eq(groups.visible, true));

  const data = await db
    .select()
    .from(groups)
    .where(eq(groups.visible, true))
    .orderBy(asc(groups.name))
    .limit(limit)
    .offset(offset);

  const items = data.map((group) => ({
    id: group.id,
    slug: group.slug,
    name: group.name,
    description: group.description,
    website: group.website,
    meetingFrequency: group.meetingFrequency,
    logo: imageUrl(group.logo),
    coverImage: imageUrl(group.coverImage),
    url: contentUrl("groups", group.slug),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  }));

  const baseUrl = url.origin + url.pathname;
  const linkHeader = buildLinkHeader(baseUrl, { limit, offset }, total);

  return jsonResponse(
    {
      data: items,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    },
    { linkHeader },
  );
}
