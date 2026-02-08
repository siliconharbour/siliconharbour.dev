import type { Route } from "./+types/companies.$slug";
import { db } from "~/db";
import { companies } from "~/db/schema";
import { eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createDetailApiLoader } from "~/lib/api-route.server";

const mapCompany = (company: typeof companies.$inferSelect) => ({
  id: company.id,
  slug: company.slug,
  name: company.name,
  description: company.description,
  website: company.website,
  wikipedia: company.wikipedia,
  location: company.location,
  founded: company.founded,
  logo: imageUrl(company.logo),
  coverImage: imageUrl(company.coverImage),
  url: contentUrl("companies", company.slug),
  createdAt: company.createdAt.toISOString(),
  updatedAt: company.updatedAt.toISOString(),
});

export const loader = createDetailApiLoader({
  entityName: "Company",
  loadBySlug: async (slug) => {
    const [company] = await db.select().from(companies).where(eq(companies.slug, slug));
    return company ?? null;
  },
  mapEntity: mapCompany,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
