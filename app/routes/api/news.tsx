import type { Route } from "./+types/news";
import { db } from "~/db";
import { news } from "~/db/schema";
import { desc, count, eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createPaginatedApiLoader } from "~/lib/api-route.server";

const mapArticle = (article: typeof news.$inferSelect) => ({
  id: article.id,
  slug: article.slug,
  type: article.type,
  title: article.title,
  externalUrl: article.externalUrl,
  sourceName: article.sourceName,
  content: article.content,
  excerpt: article.excerpt,
  coverImage: imageUrl(article.coverImage),
  publishedAt: article.publishedAt?.toISOString() || null,
  status: article.status,
  url: contentUrl("news", article.slug),
  createdAt: article.createdAt.toISOString(),
  updatedAt: article.updatedAt.toISOString(),
});

export const loader = createPaginatedApiLoader({
  loadPage: async ({ limit, offset }) => {
    const [{ total }] = await db
      .select({ total: count() })
      .from(news)
      .where(eq(news.status, "published"));

    const items = await db
      .select()
      .from(news)
      .where(eq(news.status, "published"))
      .orderBy(desc(news.publishedAt))
      .limit(limit)
      .offset(offset);

    return { items, total };
  },
  mapItem: mapArticle,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
