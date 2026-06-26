/**
 * Custom News Scraper Registry
 * For sites without RSS feeds (e.g. VOCM)
 * Pattern mirrors app/lib/job-importers/custom.server.ts
 */

import type {
  NewsImporter,
  FetchedNewsItem,
  NewsImportSourceConfig,
} from "./types";
import { genesisScraper } from "./custom/genesis";

/**
 * Scraper function signature.
 * sourceIdentifier format: "scraperName" or "scraperName:config"
 */
type NewsScraper = (
  config: NewsImportSourceConfig,
) => Promise<FetchedNewsItem[]>;

/**
 * Registry of custom news scrapers.
 * Add new scrapers here as needed.
 */
const scrapers: Record<string, NewsScraper> = {
  genesis: genesisScraper,
};

function parseScraperName(sourceIdentifier: string): string {
  // sourceIdentifier is "scraperName" or "scraperName:extraConfig"
  return sourceIdentifier.split(":")[0];
}

export const customNewsImporter: NewsImporter = {
  sourceType: "custom",
  meta: {
    name: "Custom Scraper",
    description: "Custom scrapers for sites without RSS feeds",
  },
  async fetchItems(
    config: NewsImportSourceConfig,
  ): Promise<FetchedNewsItem[]> {
    const identifier = config.sourceIdentifier;
    if (!identifier) {
      throw new Error("Custom news sources require a sourceIdentifier");
    }

    const scraperName = parseScraperName(identifier);
    const scraper = scrapers[scraperName];
    if (!scraper) {
      throw new Error(
        `Unknown news scraper: ${scraperName}. Available: ${Object.keys(scrapers).join(", ") || "(none)"}`,
      );
    }

    return scraper(config);
  },
};
