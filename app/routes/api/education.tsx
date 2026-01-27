import type { Route } from "./+types/education";
import { db } from "~/db";
import { education } from "~/db/schema";
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
    .from(education)
    .where(eq(education.visible, true));

  const data = await db
    .select()
    .from(education)
    .where(eq(education.visible, true))
    .orderBy(asc(education.name))
    .limit(limit)
    .offset(offset);

  const items = data.map((inst) => ({
    id: inst.id,
    slug: inst.slug,
    name: inst.name,
    description: inst.description,
    type: inst.type,
    website: inst.website,
    logo: imageUrl(inst.logo),
    coverImage: imageUrl(inst.coverImage),
    url: contentUrl("education", inst.slug),
    createdAt: inst.createdAt.toISOString(),
    updatedAt: inst.updatedAt.toISOString(),
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
