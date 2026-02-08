import { format } from "date-fns";
import type { News } from "~/db/schema";
import { Pagination } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";

export interface NewsListingData {
  articles: News[];
  total: number;
  limit: number;
  offset: number;
  searchQuery: string;
  hasRecentHeadline: boolean;
}

interface NewsListingProps {
  data: NewsListingData;
  searchPlaceholder: string;
  emptyNoSearch: string;
  emptyWithSearch: string;
  headlineMode: boolean;
  showTypeBadge: boolean;
}

function TypeBadge({ type }: { type: string }) {
  if (type === "announcement") return null;

  const labels: Record<string, string> = {
    general: "General",
    editorial: "Editorial",
    meta: "Site Update",
  };

  return (
    <span className="text-xs uppercase tracking-wide text-harbour-500 font-medium">
      {labels[type] || type}
    </span>
  );
}

function HeadlineArticle({ article, showTypeBadge }: { article: News; showTypeBadge: boolean }) {
  return (
    <a href={`/news/${article.slug}`} className="group lg:col-span-2 flex flex-col gap-4">
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
        {showTypeBadge ? <TypeBadge type={article.type} /> : null}
        <h2 className="link-title text-2xl lg:text-3xl font-bold text-harbour-700 group-hover:text-harbour-600 leading-tight">
          {article.title}
        </h2>
        {article.publishedAt && (
          <p className="text-sm text-harbour-400">{format(article.publishedAt, "EEEE, MMMM d, yyyy")}</p>
        )}
        {article.excerpt && <p className="text-harbour-600 line-clamp-3">{article.excerpt}</p>}
      </div>
    </a>
  );
}

function SecondaryArticle({ article, showTypeBadge }: { article: News; showTypeBadge: boolean }) {
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
        {showTypeBadge ? <TypeBadge type={article.type} /> : null}
        <h3 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600 line-clamp-2 leading-tight">
          {article.title}
        </h3>
        {article.publishedAt && (
          <p className="text-xs text-harbour-400">{format(article.publishedAt, "MMM d, yyyy")}</p>
        )}
      </div>
    </a>
  );
}

function ArticleCard({ article, showTypeBadge }: { article: News; showTypeBadge: boolean }) {
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
        {showTypeBadge ? <TypeBadge type={article.type} /> : null}
        <h3 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600 line-clamp-2 leading-tight">
          {article.title}
        </h3>
        {article.publishedAt && (
          <p className="text-xs text-harbour-400">{format(article.publishedAt, "MMM d, yyyy")}</p>
        )}
        {article.excerpt && <p className="text-sm text-harbour-500 line-clamp-2">{article.excerpt}</p>}
      </div>
    </a>
  );
}

export function NewsListing({
  data,
  searchPlaceholder,
  emptyNoSearch,
  emptyWithSearch,
  headlineMode,
  showTypeBadge,
}: NewsListingProps) {
  const { articles, total, limit, offset, searchQuery, hasRecentHeadline } = data;
  const showHeadline = headlineMode && offset === 0 && hasRecentHeadline && !searchQuery && articles.length > 0;
  const headline = showHeadline ? articles[0] : null;
  const secondaryArticles = showHeadline ? articles.slice(1, 3) : [];
  const remainingArticles = showHeadline ? articles.slice(3) : articles;

  return (
    <div className="flex flex-col gap-6">
      {(total > limit || searchQuery) && (
        <div className="flex flex-col gap-2">
          <SearchInput placeholder={searchPlaceholder} />
          {searchQuery && (
            <p className="text-sm text-harbour-500">
              {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}
        </div>
      )}

      {articles.length === 0 ? (
        <p className="text-harbour-400">{searchQuery ? emptyWithSearch : emptyNoSearch}</p>
      ) : (
        <>
          {showHeadline && headline && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <HeadlineArticle article={headline} showTypeBadge={showTypeBadge} />
              {secondaryArticles.length > 0 && (
                <div className="flex flex-col gap-4">
                  {secondaryArticles.map((article) => (
                    <SecondaryArticle key={article.id} article={article} showTypeBadge={showTypeBadge} />
                  ))}
                </div>
              )}
            </div>
          )}

          {remainingArticles.length > 0 && (
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${showHeadline ? "mt-6" : ""}`}>
              {remainingArticles.map((article) => (
                <ArticleCard key={article.id} article={article} showTypeBadge={showTypeBadge} />
              ))}
            </div>
          )}
        </>
      )}

      <Pagination total={total} limit={limit} offset={offset} />
    </div>
  );
}
