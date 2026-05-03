/**
 * RSS/Atom Feed Importer
 * Fetches and parses RSS/Atom feeds to extract news items
 */

import type {
  NewsImporter,
  FetchedNewsItem,
  NewsImportSourceConfig,
  ExcerptMode,
} from "./types";

/**
 * Pick the excerpt text based on excerptMode.
 * - "description": use <description> field
 * - "content": use <content:encoded> field (full article body, truncated)
 * - "none": no excerpt
 */
function pickExcerpt(
  description: string | null,
  contentEncoded: string | null,
  mode: ExcerptMode,
): string | undefined {
  if (mode === "none") return undefined;

  const raw = mode === "content" ? (contentEncoded || description) : description;
  if (!raw) return undefined;

  return decodeHtmlEntities(stripHtml(raw)).slice(0, 500) || undefined;
}

/**
 * Parse RSS/Atom XML into news items.
 * Handles both RSS 2.0 (<item>) and Atom (<entry>) feeds.
 * Uses regex-based parsing to avoid XML parser dependencies.
 */
export function parseRssItems(xml: string, excerptMode: ExcerptMode = "description"): FetchedNewsItem[] {
  const items: FetchedNewsItem[] = [];

  // Try RSS 2.0 format first (<item> elements)
  const rssItemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = rssItemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const guid = extractTag(block, "guid");
    const description = extractTag(block, "description");
    const contentEncoded = extractTag(block, "content:encoded");
    const pubDate = extractTag(block, "pubDate");

    if (!title || !link) continue;

    items.push({
      sourceItemId: guid || link,
      title: decodeHtmlEntities(title),
      url: link,
      excerpt: pickExcerpt(description, contentEncoded, excerptMode),
      publishedAt: pubDate ? new Date(pubDate) : undefined,
    });
  }

  // If no RSS items found, try Atom format (<entry> elements)
  if (items.length === 0) {
    const atomEntryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    while ((match = atomEntryRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = extractTag(block, "title");
      const link = extractAtomLink(block);
      const id = extractTag(block, "id");
      const summary = extractTag(block, "summary");
      const content = extractTag(block, "content");
      const published =
        extractTag(block, "published") || extractTag(block, "updated");

      if (!title || !link) continue;

      items.push({
        sourceItemId: id || link,
        title: decodeHtmlEntities(title),
        url: link,
        excerpt: pickExcerpt(summary, content, excerptMode),
        publishedAt: published ? new Date(published) : undefined,
      });
    }
  }

  return items;
}

/** Extract text content from an XML tag */
function extractTag(xml: string, tag: string): string | null {
  // Handle CDATA sections
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i",
  );
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  // Handle regular text content
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = regex.exec(xml);
  return match ? match[1].trim() : null;
}

/** Extract href from Atom <link> element */
function extractAtomLink(xml: string): string | null {
  // Match <link rel="alternate" href="..."/> or <link href="..."/>
  const altMatch =
    /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(xml);
  if (altMatch) return altMatch[1];
  const hrefMatch = /<link[^>]*href=["']([^"']+)["']/i.exec(xml);
  return hrefMatch ? hrefMatch[1] : null;
}

/** Strip HTML tags from text */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Decode common HTML entities */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export const rssImporter: NewsImporter = {
  sourceType: "rss",
  meta: {
    name: "RSS/Atom Feed",
    description: "Import news from RSS or Atom feeds",
  },
  async fetchItems(
    config: NewsImportSourceConfig,
  ): Promise<FetchedNewsItem[]> {
    const response = await fetch(config.sourceUrl, {
      headers: {
        "User-Agent": "siliconharbour.dev news aggregator",
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch RSS feed: ${response.status} ${response.statusText}`,
      );
    }

    const xml = await response.text();
    return parseRssItems(xml, config.excerptMode || "description");
  },
};
