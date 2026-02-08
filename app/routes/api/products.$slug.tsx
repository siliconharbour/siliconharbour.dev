import type { Route } from "./+types/products.$slug";
import { db } from "~/db";
import { products, companies } from "~/db/schema";
import { eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createDetailApiLoader } from "~/lib/api-route.server";

const mapProduct = async (product: typeof products.$inferSelect) => {
  let company = null;
  if (product.companyId) {
    const [c] = await db
      .select({ id: companies.id, slug: companies.slug, name: companies.name })
      .from(companies)
      .where(eq(companies.id, product.companyId));
    if (c) {
      company = {
        id: c.id,
        slug: c.slug,
        name: c.name,
        url: contentUrl("companies", c.slug),
      };
    }
  }

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    type: product.type,
    website: product.website,
    company,
    logo: imageUrl(product.logo),
    coverImage: imageUrl(product.coverImage),
    url: contentUrl("products", product.slug),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
};

export const loader = createDetailApiLoader({
  entityName: "Product",
  loadBySlug: async (slug) => {
    const [product] = await db.select().from(products).where(eq(products.slug, slug));
    return product ?? null;
  },
  mapEntity: mapProduct,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
