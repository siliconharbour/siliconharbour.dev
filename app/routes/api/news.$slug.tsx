import type { Route } from "./+types/news.$slug";
import { db } from "~/db";
import { news } from "~/db/schema";
import { and, eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createDetailApiLoader } from "~/lib/api-route.server";

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

export const loader = createDetailApiLoader({
  entityName: "Article",
  loadBySlug: async (slug) => {
    const [article] = await db
      .select()
      .from(news)
      .where(and(eq(news.slug, slug), eq(news.status, "published")));
    return article ?? null;
  },
  mapEntity: mapArticle,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
