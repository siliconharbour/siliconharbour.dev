import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { getPaginatedNews, type NewsType } from "~/lib/news.server";
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

const validTypes = ["announcement", "editorial", "meta"] as const;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  const typeParam = url.searchParams.get("type");
  
  // Validate type filter
  const typeFilter = typeParam && validTypes.includes(typeParam as NewsType) 
    ? (typeParam as NewsType) 
    : undefined;
  
  const { items: articles, total } = await getPaginatedNews(limit, offset, searchQuery, typeFilter);
  
  // Check if the latest article is from the last 7 days (for headline treatment)
  const oneWeekAgo = subDays(new Date(), 7);
  const hasRecentHeadline = articles.length > 0 && 
    articles[0].publishedAt && 
    isAfter(articles[0].publishedAt, oneWeekAgo);
  
  return { articles, total, limit, offset, searchQuery, hasRecentHeadline, typeFilter };
}

export default function NewsIndex() {
  const { articles, total, limit, offset, searchQuery, hasRecentHeadline, typeFilter } = useLoaderData<typeof loader>();
  
  // If we're on the first page and have a recent headline, split articles
  const isFirstPage = offset === 0;
  const showHeadline = isFirstPage && hasRecentHeadline && !searchQuery && !typeFilter && articles.length > 0;
  
  const headline = showHeadline ? articles[0] : null;
  const secondaryArticles = showHeadline ? articles.slice(1, 3) : [];
  const remainingArticles = showHeadline ? articles.slice(3) : articles;

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-6">
        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-4">
          <FilterTab href="/news" active={!typeFilter} label="All" />
          <FilterTab href="/news?type=announcement" active={typeFilter === "announcement"} label="Announcements" />
          <FilterTab href="/news?type=editorial" active={typeFilter === "editorial"} label="Editorial" />
          <FilterTab href="/news?type=meta" active={typeFilter === "meta"} label="Site Updates" />
        </div>

        {/* Search - only show if pagination is needed */}
        {(total > limit || searchQuery) && (
          <div className="flex flex-col gap-2">
            <SearchInput placeholder="Search news..." preserveParams={["type"]} />
            
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
              ? "No news articles match your search." 
              : typeFilter 
                ? `No ${typeFilter === "meta" ? "site updates" : typeFilter + "s"} yet.`
                : "No news articles yet."}
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
              <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${showHeadline ? "mt-6" : ""}`}>
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
// Filter Tab Component
// =============================================================================

function FilterTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      to={href}
      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-harbour-600 text-white"
          : "text-harbour-600 hover:bg-harbour-50"
      }`}
    >
      {label}
    </Link>
  );
}

// =============================================================================
// Article Components
// =============================================================================

function TypeBadge({ type }: { type: string }) {
  if (type === "announcement") return null; // Don't show badge for default type
  
  const labels: Record<string, string> = {
    editorial: "Editorial",
    meta: "Site Update",
  };
  
  return (
    <span className="text-xs uppercase tracking-wide text-harbour-500 font-medium">
      {labels[type] || type}
    </span>
  );
}

function HeadlineArticle({ article }: { article: News }) {
  return (
    <a
      href={`/news/${article.slug}`}
      className="group lg:col-span-2 flex flex-col gap-4"
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
        <TypeBadge type={article.type} />
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
      className="group flex gap-3 pb-4 border-b border-harbour-100 last:border-b-0 last:pb-0"
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
        <TypeBadge type={article.type} />
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
      className="group flex flex-col gap-3"
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
        <TypeBadge type={article.type} />
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
