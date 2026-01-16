import { db } from "~/db";
import { news, type News, type NewNews } from "~/db/schema";
import { eq, desc, isNotNull, lte } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: news.slug }).from(news);
  return rows.map(r => r.slug);
}

export async function generateNewsSlug(title: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(title);
  let existingSlugs = await getExistingSlugs();
  
  if (excludeId) {
    const current = await db.select({ slug: news.slug }).from(news).where(eq(news.id, excludeId)).get();
    if (current) {
      existingSlugs = existingSlugs.filter(s => s !== current.slug);
    }
  }
  
  return makeSlugUnique(baseSlug, existingSlugs);
}

export async function createNews(item: Omit<NewNews, "slug">): Promise<News> {
  const slug = await generateNewsSlug(item.title);
  const [newItem] = await db.insert(news).values({ ...item, slug }).returning();
  
  await syncReferences("news", newItem.id, newItem.content);
  
  return newItem;
}

export async function updateNews(id: number, item: Partial<Omit<NewNews, "slug">>): Promise<News | null> {
  let updateData: Partial<NewNews> = { ...item, updatedAt: new Date() };
  
  if (item.title) {
    updateData.slug = await generateNewsSlug(item.title, id);
  }
  
  const [updated] = await db
    .update(news)
    .set(updateData)
    .where(eq(news.id, id))
    .returning();

  if (!updated) return null;

  if (item.content) {
    await syncReferences("news", id, item.content);
  }

  return updated;
}

export async function deleteNews(id: number): Promise<boolean> {
  await db.delete(news).where(eq(news.id, id));
  return true;
}

export async function getNewsById(id: number): Promise<News | null> {
  return db.select().from(news).where(eq(news.id, id)).get() ?? null;
}

export async function getNewsBySlug(slug: string): Promise<News | null> {
  return db.select().from(news).where(eq(news.slug, slug)).get() ?? null;
}

export async function getAllNews(): Promise<News[]> {
  return db.select().from(news).orderBy(desc(news.createdAt));
}

export async function getPublishedNews(): Promise<News[]> {
  const now = new Date();
  return db.select()
    .from(news)
    .where(lte(news.publishedAt, now))
    .orderBy(desc(news.publishedAt));
}
