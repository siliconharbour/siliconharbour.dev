import type { Route } from "./+types/detail";
import { useLoaderData } from "react-router";
import { getNewsBySlug } from "~/lib/news.server";
import { prepareRefsForClient, getRichIncomingReferences } from "~/lib/references.server";
import { PublicLayout } from "~/components/PublicLayout";
import { RichMarkdown } from "~/components/RichMarkdown";
import { format } from "date-fns";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `${data?.article?.title ?? "News"} - siliconharbour.dev` },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const article = await getNewsBySlug(params.slug);
  if (!article) {
    throw new Response("Article not found", { status: 404 });
  }
  
  const resolvedRefs = await prepareRefsForClient(article.content);
  const backlinks = await getRichIncomingReferences("news", article.id);
  
  return { article, resolvedRefs, backlinks };
}

export default function NewsDetail() {
  const { article, resolvedRefs, backlinks } = useLoaderData<typeof loader>();

  return (
    <PublicLayout>
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

          {backlinks.length > 0 && (
            <div className="border-t border-harbour-200/50 pt-6">
              <h2 className="text-lg font-semibold text-harbour-700 mb-3">Referenced By</h2>
              <ul className="flex flex-col gap-2">
                {backlinks.map((link) => (
                  <li key={`${link.type}-${link.id}`}>
                    <a href={link.url} className="text-harbour-600 hover:text-harbour-700">
                      {link.name}
                    </a>
                    <span className="text-harbour-400 text-sm ml-2">({link.type})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      </div>
    </PublicLayout>
  );
}
