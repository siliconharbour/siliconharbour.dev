import type { Route } from "./+types/general";
import { useLoaderData } from "react-router";
import { getPaginatedNews } from "~/lib/news.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";
import { format } from "date-fns";
import type { News } from "~/db/schema";

export function meta({}: Route.MetaArgs) {
  return [{ title: "General - News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";

  const { items: articles, total } = await getPaginatedNews(limit, offset, searchQuery, "general");

  return { articles, total, limit, offset, searchQuery };
}

export default function NewsGeneral() {
  const { articles, total, limit, offset, searchQuery } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-6">
      {/* Search - only show if pagination is needed */}
      {(total > limit || searchQuery) && (
        <div className="flex flex-col gap-2">
          <SearchInput placeholder="Search general news..." />

          {/* Result count */}
          {searchQuery && (
            <p className="text-sm text-harbour-500">
              {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}
        </div>
      )}

      {articles.length === 0 ? (
        <p className="text-harbour-400">
          {searchQuery
            ? "No general news articles match your search."
            : "No general news articles yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      <Pagination total={total} limit={limit} offset={offset} />
    </div>
  );
}

function ArticleCard({ article }: { article: News }) {
  return (
    <a href={`/news/${article.slug}`} className="group flex flex-col gap-3">
      {article.coverImage && (
        <div className="img-tint aspect-video relative overflow-hidden bg-harbour-100">
          <img
            src={`/images/${article.coverImage}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <h3 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600 line-clamp-2 leading-tight">
          {article.title}
        </h3>
        {article.publishedAt && (
          <p className="text-xs text-harbour-400">{format(article.publishedAt, "MMM d, yyyy")}</p>
        )}
        {article.excerpt && (
          <p className="text-sm text-harbour-500 line-clamp-2">{article.excerpt}</p>
        )}
      </div>
    </a>
  );
}
