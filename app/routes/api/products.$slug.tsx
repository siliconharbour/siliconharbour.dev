import type { Route } from "./+types/products.$slug";
import { db } from "~/db";
import { products, companies } from "~/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, imageUrl, contentUrl } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const [product] = await db.select().from(products).where(eq(products.slug, params.slug));

  if (!product) {
    return jsonResponse({ error: "Product not found" }, { status: 404 });
  }

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

  return jsonResponse({
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
  });
}
