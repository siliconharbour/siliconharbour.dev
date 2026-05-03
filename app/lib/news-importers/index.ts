/**
 * News Importer Registry
 * Factory for getting the correct importer based on source type
 */

import type { NewsImporter, NewsSourceType } from "./types";
import { rssImporter } from "./rss.server";
import { customNewsImporter } from "./custom.server";

const importers: Record<string, NewsImporter> = {
  rss: rssImporter,
  custom: customNewsImporter,
};

/**
 * Get an importer for the given source type
 */
export function getNewsImporter(sourceType: NewsSourceType): NewsImporter {
  const importer = importers[sourceType];
  if (!importer) {
    throw new Error(
      `Unsupported news source type: ${sourceType}. Supported types: ${Object.keys(importers).join(", ")}`,
    );
  }
  return importer;
}

/**
 * Check if a source type has an importer available
 */
export function hasNewsImporter(sourceType: string): boolean {
  return sourceType in importers;
}

// Re-export types for convenience
export * from "./types";
