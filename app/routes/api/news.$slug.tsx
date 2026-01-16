import type { Route } from "./+types/news.$slug";
import { db } from "~/db";
import { news } from "~/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, imageUrl, contentUrl } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const [article] = await db
    .select()
    .from(news)
    .where(eq(news.slug, params.slug));
  
  if (!article) {
    return jsonResponse({ error: "Article not found" }, { status: 404 });
  }
  
  return jsonResponse({
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
}
