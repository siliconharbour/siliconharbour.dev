import type { Route } from "./+types/news";
import { db } from "~/db";
import { news } from "~/db/schema";
import { desc, count, isNotNull } from "drizzle-orm";
import {
  parsePagination,
  paginatedJsonResponse,
  imageUrl,
  contentUrl,
} from "~/lib/api.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePagination(url);

  // Only count/return published articles
  const [{ total }] = await db
    .select({ total: count() })
    .from(news)
    .where(isNotNull(news.publishedAt));

  const data = await db
    .select()
    .from(news)
    .where(isNotNull(news.publishedAt))
    .orderBy(desc(news.publishedAt))
    .limit(limit)
    .offset(offset);

  const items = data.map((article) => ({
    id: article.id,
    slug: article.slug,
    title: article.title,
    content: article.content,
    excerpt: article.excerpt,
    coverImage: imageUrl(article.coverImage),
    publishedAt: article.publishedAt?.toISOString() || null,
    url: contentUrl("news", article.slug),
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  }));

  return paginatedJsonResponse(url, items, { total, limit, offset });
}
