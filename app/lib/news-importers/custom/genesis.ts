import { parseHTML } from "linkedom";
import { normalizeTextForDisplay } from "~/lib/job-importers/text.server";
import type { FetchedNewsItem, NewsImportSourceConfig } from "../types";

const DEFAULT_BLOG_URL = "https://www.genesiscentre.ca/blog/";
const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function absoluteUrl(href: string, baseUrl: string): string {
  return new URL(href, baseUrl).toString();
}

function parsePublishedAt(text: string): Date | undefined {
  const match = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s+(\d{4})(?!\d)/i.exec(text);
  if (!match) return undefined;

  const month = MONTHS[match[1].toLowerCase()];
  const day = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (month === undefined || !day || !year) return undefined;

  return new Date(Date.UTC(year, month, day));
}

export function parseGenesisBlogItems(html: string, baseUrl = DEFAULT_BLOG_URL): FetchedNewsItem[] {
  const { document } = parseHTML(html);
  const seen = new Set<string>();
  const items: FetchedNewsItem[] = [];

  for (const link of Array.from(document.querySelectorAll('a[href^="/blog/"]'))) {
    const title = normalizeTextForDisplay(link.querySelector("h3")?.textContent ?? "");
    const href = link.getAttribute("href");
    if (!title || !href || href === "/blog") continue;

    const url = absoluteUrl(href, baseUrl);
    if (seen.has(url)) continue;
    seen.add(url);

    const cardText = normalizeTextForDisplay(
      `${link.textContent ?? ""} ${link.parentElement?.textContent ?? ""}`,
    );
    items.push({
      sourceItemId: url,
      title,
      url,
      publishedAt: parsePublishedAt(cardText),
    });
  }

  return items;
}

export async function genesisScraper(config: NewsImportSourceConfig): Promise<FetchedNewsItem[]> {
  const url = config.sourceUrl || DEFAULT_BLOG_URL;
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "siliconharbour.dev news aggregator",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Genesis blog: ${response.status} ${response.statusText}`);
  }

  return parseGenesisBlogItems(await response.text(), url);
}
