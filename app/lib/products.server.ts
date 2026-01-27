import { db } from "~/db";
import { products, companies, type Product, type NewProduct, type Company } from "~/db/schema";
import { eq, desc, count, inArray } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";
import { searchContentIds } from "./search.server";

// =============================================================================
// Slug generation
// =============================================================================

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: products.slug }).from(products);
  return rows.map((r) => r.slug);
}

export async function generateProductSlug(name: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(name);
  let existingSlugs = await getExistingSlugs();

  if (excludeId) {
    const current = await db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.id, excludeId))
      .get();
    if (current) {
      existingSlugs = existingSlugs.filter((s) => s !== current.slug);
    }
  }

  return makeSlugUnique(baseSlug, existingSlugs);
}

// =============================================================================
// Product CRUD
// =============================================================================

export async function createProduct(product: Omit<NewProduct, "slug">): Promise<Product> {
  const slug = await generateProductSlug(product.name);
  const [newProduct] = await db
    .insert(products)
    .values({ ...product, slug })
    .returning();

  await syncReferences("product", newProduct.id, newProduct.description);

  return newProduct;
}

export async function updateProduct(
  id: number,
  product: Partial<Omit<NewProduct, "slug">>,
): Promise<Product | null> {
  let updateData: Partial<NewProduct> = { ...product, updatedAt: new Date() };

  if (product.name) {
    updateData.slug = await generateProductSlug(product.name, id);
  }

  const [updated] = await db
    .update(products)
    .set(updateData)
    .where(eq(products.id, id))
    .returning();

  if (!updated) return null;

  if (product.description) {
    await syncReferences("product", id, product.description);
  }

  return updated;
}

export async function deleteProduct(id: number): Promise<boolean> {
  await db.delete(products).where(eq(products.id, id));
  return true;
}

export async function getProductById(id: number): Promise<Product | null> {
  return db.select().from(products).where(eq(products.id, id)).get() ?? null;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  return db.select().from(products).where(eq(products.slug, slug)).get() ?? null;
}

export async function getAllProducts(): Promise<Product[]> {
  return db.select().from(products).orderBy(desc(products.createdAt));
}

// =============================================================================
// Product with company helper
// =============================================================================

export type ProductWithCompany = Product & { company: Company | null };

export async function getProductWithCompany(id: number): Promise<ProductWithCompany | null> {
  const product = await getProductById(id);
  if (!product) return null;

  let company: Company | null = null;
  if (product.companyId) {
    company =
      (await db.select().from(companies).where(eq(companies.id, product.companyId)).get()) ?? null;
  }

  return { ...product, company };
}

export async function getProductBySlugWithCompany(
  slug: string,
): Promise<ProductWithCompany | null> {
  const product = await getProductBySlug(slug);
  if (!product) return null;

  let company: Company | null = null;
  if (product.companyId) {
    company =
      (await db.select().from(companies).where(eq(companies.id, product.companyId)).get()) ?? null;
  }

  return { ...product, company };
}

export async function getAllProductsWithCompany(): Promise<ProductWithCompany[]> {
  const allProducts = await getAllProducts();

  // Batch fetch companies for efficiency
  const companyIds = [...new Set(allProducts.filter((p) => p.companyId).map((p) => p.companyId!))];
  const companyMap = new Map<number, Company>();

  if (companyIds.length > 0) {
    const companyList = await db.select().from(companies).where(inArray(companies.id, companyIds));
    for (const c of companyList) {
      companyMap.set(c.id, c);
    }
  }

  return allProducts.map((product) => ({
    ...product,
    company: product.companyId ? (companyMap.get(product.companyId) ?? null) : null,
  }));
}

// =============================================================================
// Paginated queries with search
// =============================================================================

export interface PaginatedProducts {
  items: ProductWithCompany[];
  total: number;
}

export async function getPaginatedProducts(
  limit: number,
  offset: number,
  searchQuery?: string,
): Promise<PaginatedProducts> {
  // If searching, use FTS5
  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("product", searchQuery);

    if (matchingIds.length === 0) {
      return { items: [], total: 0 };
    }

    const productList = await db
      .select()
      .from(products)
      .where(inArray(products.id, matchingIds))
      .orderBy(desc(products.createdAt))
      .limit(limit)
      .offset(offset);

    // Batch fetch companies
    const companyIds = [
      ...new Set(productList.filter((p) => p.companyId).map((p) => p.companyId!)),
    ];
    const companyMap = new Map<number, Company>();

    if (companyIds.length > 0) {
      const companyList = await db
        .select()
        .from(companies)
        .where(inArray(companies.id, companyIds));
      for (const c of companyList) {
        companyMap.set(c.id, c);
      }
    }

    const items = productList.map((product) => ({
      ...product,
      company: product.companyId ? (companyMap.get(product.companyId) ?? null) : null,
    }));

    return { items, total: matchingIds.length };
  }

  // No search - get total count and paginated items
  const [{ total }] = await db.select({ total: count() }).from(products);

  const productList = await db
    .select()
    .from(products)
    .orderBy(desc(products.createdAt))
    .limit(limit)
    .offset(offset);

  // Batch fetch companies
  const companyIds = [...new Set(productList.filter((p) => p.companyId).map((p) => p.companyId!))];
  const companyMap = new Map<number, Company>();

  if (companyIds.length > 0) {
    const companyList = await db.select().from(companies).where(inArray(companies.id, companyIds));
    for (const c of companyList) {
      companyMap.set(c.id, c);
    }
  }

  const items = productList.map((product) => ({
    ...product,
    company: product.companyId ? (companyMap.get(product.companyId) ?? null) : null,
  }));

  return { items, total };
}

// =============================================================================
// Products by company
// =============================================================================

export async function getProductsByCompany(companyId: number): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(eq(products.companyId, companyId))
    .orderBy(desc(products.createdAt));
}
