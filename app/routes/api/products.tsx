import type { Route } from "./+types/products";
import { db } from "~/db";
import { products, companies } from "~/db/schema";
import { asc, count } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createPaginatedApiLoader } from "~/lib/api-route.server";

const mapProduct = (
  product: typeof products.$inferSelect,
  companyMap: Map<number, { id: number; slug: string; name: string }>,
) => {
  const company = product.companyId ? companyMap.get(product.companyId) : null;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    type: product.type,
    website: product.website,
    company: company
      ? {
          id: company.id,
          slug: company.slug,
          name: company.name,
          url: contentUrl("companies", company.slug),
        }
      : null,
    logo: imageUrl(product.logo),
    coverImage: imageUrl(product.coverImage),
    url: contentUrl("products", product.slug),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
};

export const loader = createPaginatedApiLoader({
  loadPage: async ({ limit, offset }) => {
    const [{ total }] = await db.select({ total: count() }).from(products);

    const productsPage = await db
      .select()
      .from(products)
      .orderBy(asc(products.name))
      .limit(limit)
      .offset(offset);

    const companyIds = [...new Set(productsPage.filter((p) => p.companyId).map((p) => p.companyId!))];
    const companyMap = new Map<number, { id: number; slug: string; name: string }>();
    if (companyIds.length > 0) {
      const companyRows = await db
        .select({ id: companies.id, slug: companies.slug, name: companies.name })
        .from(companies);
      for (const company of companyRows) {
        companyMap.set(company.id, company);
      }
    }

    const items = productsPage.map((product) => mapProduct(product, companyMap));
    return { items, total };
  },
  mapItem: (item) => item,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
