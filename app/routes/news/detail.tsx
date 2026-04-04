import type { Route } from "./+types/detail";
import { Link, useLoaderData } from "react-router";
import { getNewsBySlug } from "~/lib/news.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { getPublicComments, getAllComments } from "~/lib/comments.server";
import { getTurnstileSiteKey } from "~/lib/turnstile.server";
import { getOptionalUser } from "~/lib/session.server";
import { areCommentsEnabled } from "~/lib/config.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { CommentSection } from "~/components/CommentSection";
import { ReferencedBy } from "~/components/ReferencedBy";
import { format } from "date-fns";
import { buildSeoMeta, stripMarkdown } from "~/lib/seo";

export function meta({ data, params }: Route.MetaArgs) {
  const article = data?.article;
  const title = article?.title ?? "News";
  const description = article?.excerpt
    ? stripMarkdown(article.excerpt)
    : article?.content
      ? stripMarkdown(article.content)
      : `${title} — NL tech news from siliconharbour.dev.`;
  const slug = params.slug ?? "";
  const ogImageUrl = `https://siliconharbour.dev/news/${slug}.png`;

  return buildSeoMeta({
    title,
    description,
    url: `/news/${slug}`,
    ogImage: ogImageUrl,
    ogType: "article",
  });
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const article = await getNewsBySlug(params.slug);
  if (!article) {
    throw new Response("Article not found", { status: 404 });
  }

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const [resolvedRefs, backlinks, comments, commentsEnabled] = await Promise.all([
    prepareRefsForClient(article.content),
    getDetailedBacklinks("news", article.id),
    isAdmin ? getAllComments("news", article.id) : getPublicComments("news", article.id),
    areCommentsEnabled("news"),
  ]);

  const turnstileSiteKey = getTurnstileSiteKey();

  return { article, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin, commentsEnabled };
}

export default function NewsDetail() {
  const { article, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin, commentsEnabled } =
    useLoaderData<typeof loader>();

  return (
    <div className="max-w-[60ch] mx-auto p-4 py-8">
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
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">{article.title}</h1>
            {isAdmin && (
              <Link
                to={`/manage/news/${article.id}`}
                className="p-1.5 text-harbour-400 hover:text-harbour-600 hover:bg-harbour-100 transition-colors"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </Link>
            )}
          </div>
          {article.publishedAt && (
            <p className="text-harbour-500">{format(article.publishedAt, "MMMM d, yyyy")}</p>
          )}
        </div>

        <div className="prose">
          <RichMarkdown content={article.content} resolvedRefs={resolvedRefs} />
        </div>

        <ReferencedBy backlinks={backlinks} />

        {commentsEnabled && (
          <CommentSection
            contentType="news"
            contentId={article.id}
            comments={comments}
            turnstileSiteKey={turnstileSiteKey}
            isAdmin={isAdmin}
          />
        )}
      </article>
    </div>
  );
}
