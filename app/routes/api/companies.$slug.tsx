import type { Route } from "./+types/companies.$slug";
import { db } from "~/db";
import { companies } from "~/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, imageUrl, contentUrl, notFoundResponse } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const [company] = await db.select().from(companies).where(eq(companies.slug, params.slug));

  if (!company) {
    return notFoundResponse("Company not found");
  }

  return jsonResponse({
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
}
