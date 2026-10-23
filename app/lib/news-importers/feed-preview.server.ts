import { fetchPublicFeed } from "./feed-fetch.server";
import { parseRssItems } from "./rss.server";
import type { ExcerptMode } from "./types";
export async function previewNewsFeed(
  url: string,
  excerptMode: ExcerptMode,
  keywords: string | null,
) {
  const allItems = parseRssItems(await fetchPublicFeed(url), excerptMode);
  const terms = (keywords ?? "")
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
  const items = allItems.map((item) => ({
    title: item.title,
    url: item.url,
    excerpt: item.excerpt?.slice(0, 200) || null,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    matched:
      !terms.length ||
      terms.some((term) => `${item.title} ${item.excerpt ?? ""}`.toLowerCase().includes(term)),
  }));
  const matchedCount = items.filter((item) => item.matched).length;
  return {
    items,
    totalCount: allItems.length,
    matchedCount,
    filteredCount: items.length - matchedCount,
  };
}
