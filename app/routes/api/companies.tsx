import type { Route } from "./+types/companies";
import { db } from "~/db";
import { companies } from "~/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createPaginatedApiLoader } from "~/lib/api-route.server";

const mapCompany = (company: typeof companies.$inferSelect) => ({
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
});

export const loader = createPaginatedApiLoader({
  loadPage: async ({ limit, offset }) => {
    const [{ total }] = await db
      .select({ total: count() })
      .from(companies)
      .where(eq(companies.visible, true));

    const items = await db
      .select()
      .from(companies)
      .where(eq(companies.visible, true))
      .orderBy(asc(companies.name))
      .limit(limit)
      .offset(offset);

    return { items, total };
  },
  mapItem: mapCompany,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
