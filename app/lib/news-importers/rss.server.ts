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

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": "\u00a0",
  "&iexcl;": "\u00a1",
  "&cent;": "\u00a2",
  "&pound;": "\u00a3",
  "&curren;": "\u00a4",
  "&yen;": "\u00a5",
  "&brvbar;": "\u00a6",
  "&sect;": "\u00a7",
  "&uml;": "\u00a8",
  "&copy;": "\u00a9",
  "&ordf;": "\u00aa",
  "&laquo;": "\u00ab",
  "&not;": "\u00ac",
  "&shy;": "\u00ad",
  "&reg;": "\u00ae",
  "&macr;": "\u00af",
  "&deg;": "\u00b0",
  "&plusmn;": "\u00b1",
  "&sup2;": "\u00b2",
  "&sup3;": "\u00b3",
  "&acute;": "\u00b4",
  "&micro;": "\u00b5",
  "&para;": "\u00b6",
  "&middot;": "\u00b7",
  "&cedil;": "\u00b8",
  "&sup1;": "\u00b9",
  "&ordm;": "\u00ba",
  "&raquo;": "\u00bb",
  "&frac14;": "\u00bc",
  "&frac12;": "\u00bd",
  "&frac34;": "\u00be",
  "&iquest;": "\u00bf",
  "&times;": "\u00d7",
  "&divide;": "\u00f7",
  "&rsquo;": "\u2019",
  "&lsquo;": "\u2018",
  "&rdquo;": "\u201d",
  "&ldquo;": "\u201c",
  "&mdash;": "\u2014",
  "&ndash;": "\u2013",
  "&hellip;": "\u2026",
  "&bull;": "\u2022",
  "&trade;": "\u2122",
  "&euro;": "\u20ac",
};

/** Decode HTML entities (named, decimal, and hex) */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(
      /&(#x[\da-fA-F]+|#\d+|\w+);/g,
      (match) => {
        if (HTML_ENTITIES[match]) return HTML_ENTITIES[match];
        if (match.startsWith("&#x")) {
          return String.fromCharCode(parseInt(match.slice(3, -1), 16));
        }
        if (match.startsWith("&#")) {
          return String.fromCharCode(Number(match.slice(2, -1)));
        }
        return match;
      },
    );
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
