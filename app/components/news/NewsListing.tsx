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

/** Only shown for articles -- links don't need a badge since they're the default */
function ArticleBadge() {
  return (
    <span className="text-xs uppercase tracking-wide text-harbour-500 font-medium">Article</span>
  );
}

function MetaLine({ article }: { article: News }) {
  return (
    <p className="text-sm text-harbour-400 flex items-center gap-1.5">
      {article.publishedAt && <span>{format(article.publishedAt, "MMM d, yyyy")}</span>}
      {article.sourceName && (
        <>
          {article.publishedAt && <span>&middot;</span>}
          <span>{article.sourceName}</span>
        </>
      )}
    </p>
  );
}

function HeadlineArticle({ article, showTypeBadge }: { article: News; showTypeBadge: boolean }) {
  const isLink = !!article.externalUrl;
  const href = isLink ? article.externalUrl! : `/news/${article.slug}`;
  const linkProps = isLink ? { target: "_blank" as const, rel: "noopener noreferrer" } : {};

  return (
    <a href={href} {...linkProps} className="group lg:col-span-2 flex flex-col gap-3">
      {article.coverImage && (
        <div className="img-tint aspect-video relative overflow-hidden bg-harbour-100">
          <img
            src={`/images/${article.coverImage}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {showTypeBadge && article.type === "article" && <ArticleBadge />}
        <h2 className="link-title text-2xl lg:text-3xl font-bold text-harbour-700 group-hover:text-harbour-600 leading-tight">
          {article.title}
        </h2>
        <MetaLine article={article} />
        {article.excerpt && <p className="text-harbour-600 line-clamp-3">{article.excerpt}</p>}
      </div>
    </a>
  );
}

function SecondaryArticle({ article, showTypeBadge }: { article: News; showTypeBadge: boolean }) {
  const isLink = !!article.externalUrl;
  const href = isLink ? article.externalUrl! : `/news/${article.slug}`;
  const linkProps = isLink ? { target: "_blank" as const, rel: "noopener noreferrer" } : {};

  return (
    <a
      href={href}
      {...linkProps}
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
        {showTypeBadge && article.type === "article" && <ArticleBadge />}
        <h3 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600 line-clamp-2 leading-tight">
          {article.title}
        </h3>
        <MetaLine article={article} />
      </div>
    </a>
  );
}

/** Linear list item -- used for the main body of items below the featured section */
function ListItem({ article, showTypeBadge }: { article: News; showTypeBadge: boolean }) {
  const isLink = !!article.externalUrl;
  const href = isLink ? article.externalUrl! : `/news/${article.slug}`;
  const linkProps = isLink ? { target: "_blank" as const, rel: "noopener noreferrer" } : {};

  return (
    <a
      href={href}
      {...linkProps}
      className="group flex gap-4 py-4 border-b border-harbour-100 last:border-b-0"
    >
      {article.coverImage && (
        <div className="img-tint w-28 h-20 relative overflow-hidden bg-harbour-100 flex-shrink-0 hidden sm:block">
          <img
            src={`/images/${article.coverImage}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {showTypeBadge && article.type === "article" && <ArticleBadge />}
          <MetaLine article={article} />
        </div>
        <h3 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600 leading-tight">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="text-sm text-harbour-500 line-clamp-2">{article.excerpt}</p>
        )}
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
  const showHeadline =
    headlineMode && offset === 0 && hasRecentHeadline && !searchQuery && articles.length > 0;
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
              {total} result{total !== 1 ? "s" : ""} for &quot;{searchQuery}&quot;
            </p>
          )}
        </div>
      )}

      {articles.length === 0 ? (
        <p className="text-harbour-400">{searchQuery ? emptyWithSearch : emptyNoSearch}</p>
      ) : (
        <>
          {/* Featured section: large headline + 2 secondaries */}
          {showHeadline && headline && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <HeadlineArticle article={headline} showTypeBadge={showTypeBadge} />
              {secondaryArticles.length > 0 && (
                <div className="flex flex-col gap-4">
                  {secondaryArticles.map((article) => (
                    <SecondaryArticle
                      key={article.id}
                      article={article}
                      showTypeBadge={showTypeBadge}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Linear list for remaining items */}
          {remainingArticles.length > 0 && (
            <div className={showHeadline ? "mt-2 border-t border-harbour-200 pt-4" : ""}>
              {remainingArticles.map((article) => (
                <ListItem key={article.id} article={article} showTypeBadge={showTypeBadge} />
              ))}
            </div>
          )}
        </>
      )}

      <Pagination total={total} limit={limit} offset={offset} />
    </div>
  );
}
