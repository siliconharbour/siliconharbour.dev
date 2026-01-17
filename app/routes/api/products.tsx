import type { Route } from "./+types/products";
import { db } from "~/db";
import { products, companies } from "~/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { parsePagination, buildLinkHeader, jsonResponse, imageUrl, contentUrl } from "~/lib/api.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePagination(url);
  
  const [{ total }] = await db.select({ total: count() }).from(products);
  
  const data = await db
    .select()
    .from(products)
    .orderBy(asc(products.name))
    .limit(limit)
    .offset(offset);
  
  // Batch fetch companies
  const companyIds = [...new Set(data.filter(p => p.companyId).map(p => p.companyId!))];
  const companyMap = new Map<number, { id: number; slug: string; name: string }>();
  
  if (companyIds.length > 0) {
    const companyList = await db
      .select({ id: companies.id, slug: companies.slug, name: companies.name })
      .from(companies);
    for (const c of companyList) {
      companyMap.set(c.id, c);
    }
  }
  
  const items = data.map(product => {
    const company = product.companyId ? companyMap.get(product.companyId) : null;
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      type: product.type,
      website: product.website,
      company: company ? {
        id: company.id,
        slug: company.slug,
        name: company.name,
        url: contentUrl("companies", company.slug),
      } : null,
      logo: imageUrl(product.logo),
      coverImage: imageUrl(product.coverImage),
      url: contentUrl("products", product.slug),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  });
  
  const baseUrl = url.origin + url.pathname;
  const linkHeader = buildLinkHeader(baseUrl, { limit, offset }, total);
  
  return jsonResponse({
    data: items,
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  }, { linkHeader });
}
