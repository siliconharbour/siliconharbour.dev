import type { Route } from "./+types/index";
import { useLoaderData } from "react-router";
import { getPaginatedNews } from "~/lib/news.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";
import { format, isAfter, subDays } from "date-fns";
import type { News } from "~/db/schema";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "News - siliconharbour.dev" },
    { name: "description", content: "News and announcements from the St. John's tech community" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  
  const { items: articles, total } = await getPaginatedNews(limit, offset, searchQuery);
  
  // Check if the latest article is from the last 7 days (for headline treatment)
  const oneWeekAgo = subDays(new Date(), 7);
  const hasRecentHeadline = articles.length > 0 && 
    articles[0].publishedAt && 
    isAfter(articles[0].publishedAt, oneWeekAgo);
  
  return { articles, total, limit, offset, searchQuery, hasRecentHeadline };
}

export default function NewsIndex() {
  const { articles, total, limit, offset, searchQuery, hasRecentHeadline } = useLoaderData<typeof loader>();
  
  // If we're on the first page and have a recent headline, split articles
  const isFirstPage = offset === 0;
  const showHeadline = isFirstPage && hasRecentHeadline && !searchQuery && articles.length > 0;
  
  const headline = showHeadline ? articles[0] : null;
  const secondaryArticles = showHeadline ? articles.slice(1, 3) : [];
  const remainingArticles = showHeadline ? articles.slice(3) : articles;

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        {/* Search - only show if pagination is needed */}
        {(total > limit || searchQuery) && (
          <div className="flex flex-col gap-2">
            <SearchInput placeholder="Search news..." />
            
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
            {searchQuery ? "No news articles match your search." : "No news articles yet."}
          </p>
        ) : (
          <>
            {/* Headline + Secondary Articles (newspaper style) */}
            {showHeadline && headline && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Headline - 2 columns */}
                <HeadlineArticle article={headline} />
                
                {/* Secondary Articles - 1 column */}
                {secondaryArticles.length > 0 && (
                  <div className="flex flex-col gap-4">
                    {secondaryArticles.map((article) => (
                      <SecondaryArticle key={article.id} article={article} />
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Remaining Articles Grid */}
            {remainingArticles.length > 0 && (
              <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${showHeadline ? "mt-8" : ""}`}>
                {remainingArticles.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            )}
          </>
        )}
        
        <Pagination total={total} limit={limit} offset={offset} />
      </div>
    </div>
  );
}

// =============================================================================
// Article Components
// =============================================================================

function HeadlineArticle({ article }: { article: News }) {
  return (
    <a
      href={`/news/${article.slug}`}
      className="group lg:col-span-2 flex flex-col gap-4 no-underline"
    >
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
        <h2 className="text-2xl lg:text-3xl font-bold text-harbour-700 group-hover:text-harbour-600 leading-tight">
          {article.title}
        </h2>
        {article.publishedAt && (
          <p className="text-sm text-harbour-400">
            {format(article.publishedAt, "EEEE, MMMM d, yyyy")}
          </p>
        )}
        {article.excerpt && (
          <p className="text-harbour-600 line-clamp-3">{article.excerpt}</p>
        )}
      </div>
    </a>
  );
}

function SecondaryArticle({ article }: { article: News }) {
  return (
    <a
      href={`/news/${article.slug}`}
      className="group flex gap-3 no-underline pb-4 border-b border-harbour-100 last:border-b-0 last:pb-0"
    >
      {article.coverImage && (
        <div className="img-tint w-24 h-20 relative overflow-hidden bg-harbour-100 flex-shrink-0">
          <img
            src={`/images/${article.coverImage}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <h3 className="font-semibold text-harbour-700 group-hover:text-harbour-600 line-clamp-2 leading-tight">
          {article.title}
        </h3>
        {article.publishedAt && (
          <p className="text-xs text-harbour-400">
            {format(article.publishedAt, "MMM d, yyyy")}
          </p>
        )}
      </div>
    </a>
  );
}

function ArticleCard({ article }: { article: News }) {
  return (
    <a
      href={`/news/${article.slug}`}
      className="group flex flex-col gap-3 no-underline"
    >
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
        <h3 className="font-semibold text-harbour-700 group-hover:text-harbour-600 line-clamp-2 leading-tight">
          {article.title}
        </h3>
        {article.publishedAt && (
          <p className="text-xs text-harbour-400">
            {format(article.publishedAt, "MMM d, yyyy")}
          </p>
        )}
        {article.excerpt && (
          <p className="text-sm text-harbour-500 line-clamp-2">{article.excerpt}</p>
        )}
      </div>
    </a>
  );
}
