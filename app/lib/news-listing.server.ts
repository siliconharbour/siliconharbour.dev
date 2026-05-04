import { isAfter, subDays } from "date-fns";
import type { NewsType } from "~/db/schema";
import { getPaginatedNews } from "./news.server";
import { parsePublicListParams } from "./public-query.server";

export async function loadNewsListingData(request: Request, type?: NewsType) {
  const url = new URL(request.url);
  const { limit, offset, searchQuery } = parsePublicListParams(url);
  const { items: articles, total } = await getPaginatedNews(limit, offset, searchQuery, type);
  const twoWeeksAgo = subDays(new Date(), 14);
  const hasRecentHeadline =
    articles.length > 0 && articles[0].publishedAt && isAfter(articles[0].publishedAt, twoWeeksAgo);

  return { articles, total, limit, offset, searchQuery, hasRecentHeadline };
}
