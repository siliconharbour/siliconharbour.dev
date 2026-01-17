import type { Route } from "./+types/detail";
import { useLoaderData } from "react-router";
import { getNewsBySlug } from "~/lib/news.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { getPublicComments, getAllComments } from "~/lib/comments.server";
import { getTurnstileSiteKey } from "~/lib/turnstile.server";
import { getOptionalUser } from "~/lib/session.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { CommentSection } from "~/components/CommentSection";
import { ReferencedBy } from "~/components/ReferencedBy";
import { format } from "date-fns";

export function meta({ data, params }: Route.MetaArgs) {
  const title = data?.article?.title ?? "News";
  const siteUrl = "https://siliconharbour.dev";
  const ogImageUrl = `${siteUrl}/news/${params.slug}.png`;
  
  return [
    { title: `${title} - siliconharbour.dev` },
    { property: "og:title", content: title },
    { property: "og:type", content: "article" },
    { property: "og:image", content: ogImageUrl },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:image", content: ogImageUrl },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const article = await getNewsBySlug(params.slug);
  if (!article) {
    throw new Response("Article not found", { status: 404 });
  }
  
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";
  
  const [resolvedRefs, backlinks, comments] = await Promise.all([
    prepareRefsForClient(article.content),
    getDetailedBacklinks("news", article.id),
    isAdmin ? getAllComments("news", article.id) : getPublicComments("news", article.id),
  ]);
  
  const turnstileSiteKey = getTurnstileSiteKey();
  
  return { article, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin };
}

export default function NewsDetail() {
  const { article, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="flex flex-col gap-6">
        {article.coverImage && (
          <div className="img-tint aspect-video relative overflow-hidden bg-harbour-100">
            <img
              src={`/images/${article.coverImage}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-harbour-700">{article.title}</h1>
          {article.publishedAt && (
            <p className="text-harbour-500">
              {format(article.publishedAt, "MMMM d, yyyy")}
            </p>
          )}
        </div>

        <RichMarkdown content={article.content} resolvedRefs={resolvedRefs} />

        <ReferencedBy backlinks={backlinks} />

        <CommentSection
          contentType="news"
          contentId={article.id}
          comments={comments}
          turnstileSiteKey={turnstileSiteKey}
          isAdmin={isAdmin}
        />
      </article>
    </div>
  );
}
