// =============================================================================
// News Importer Types - Shared types for news import modules
// This file is client-safe (no server imports)
// =============================================================================

/**
 * Supported news source types
 */
export const newsSourceTypes = ["rss", "custom"] as const;
export type NewsSourceType = (typeof newsSourceTypes)[number];

/**
 * Display labels for source types
 */
export const sourceTypeLabels: Record<NewsSourceType, string> = {
  rss: "RSS",
  custom: "Custom",
};

/**
 * A news item fetched from an external source
 */
export interface FetchedNewsItem {
  /** Unique identifier from the source (RSS guid or URL) */
  sourceItemId: string;
  /** Article title */
  title: string;
  /** External URL to the full article */
  url: string;
  /** Short summary or description */
  excerpt?: string;
  /** When the article was published */
  publishedAt?: Date;
}

/**
 * Result of a news sync operation
 */
export interface NewsSyncResult {
  success: boolean;
  error?: string;
  added: number;
  updated: number;
  filtered: number;
  totalPublished: number;
}

/**
 * Configuration for a news import source
 */
/**
 * Excerpt extraction mode for RSS feeds
 */
export const excerptModes = ["description", "content", "none"] as const;
export type ExcerptMode = (typeof excerptModes)[number];

export const excerptModeLabels: Record<ExcerptMode, string> = {
  description: "Use description",
  content: "Use content:encoded",
  none: "No excerpt",
};

/**
 * Configuration for a news import source
 */
export interface NewsImportSourceConfig {
  id: number;
  name: string;
  sourceType: NewsSourceType;
  sourceUrl: string;
  sourceIdentifier?: string | null;
  keywords?: string | null;
  excerptMode?: ExcerptMode;
}

/**
 * Interface that all news importers must implement
 */
export interface NewsImporter {
  sourceType: NewsSourceType;
  meta: {
    name: string;
    description: string;
  };
  /** Fetch news items from the source */
  fetchItems(config: NewsImportSourceConfig): Promise<FetchedNewsItem[]>;
}
