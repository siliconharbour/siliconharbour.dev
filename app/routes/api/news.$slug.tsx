import type { Route } from "./+types/news.$slug";
import { db } from "~/db";
import { news } from "~/db/schema";
import { eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createDetailApiLoader } from "~/lib/api-route.server";

const mapArticle = (article: typeof news.$inferSelect) => ({
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
});

export const loader = createDetailApiLoader({
  entityName: "Article",
  loadBySlug: async (slug) => {
    const [article] = await db.select().from(news).where(eq(news.slug, slug));
    return article ?? null;
  },
  mapEntity: mapArticle,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
