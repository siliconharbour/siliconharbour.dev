/**
 * Full-text search utilities using SQLite FTS5
 */

import { rawDb } from "~/db";
import type { ContentType } from "~/db/schema";

// FTS table names mapped to content types
const ftsTableMap: Record<ContentType, string> = {
  event: "events_fts",
  company: "companies_fts",
  group: "groups_fts",
  learning: "learning_fts",
  person: "people_fts",
  news: "news_fts",
  job: "jobs_fts",
  project: "projects_fts",
  product: "products_fts",
};

/**
 * Escape special FTS5 characters in search query
 * FTS5 uses: AND OR NOT ( ) * " ^
 */
function escapeFtsQuery(query: string): string {
  // Remove special characters that could break the query
  // Keep alphanumeric, spaces, and common punctuation
  return query
    .replace(/[*"^()]/g, " ") // Remove FTS operators
    .replace(/\s+/g, " ")     // Normalize whitespace
    .trim();
}

/**
 * Build an FTS5 match query from user input
 * Adds prefix matching (*) for better partial matches
 */
function buildFtsQuery(query: string): string {
  const escaped = escapeFtsQuery(query);
  if (!escaped) return "";
  
  // Split into words and add prefix matching to each
  const words = escaped.split(" ").filter(w => w.length > 0);
  
  // For single-word queries, just use prefix match
  if (words.length === 1) {
    return `"${words[0]}"*`;
  }
  
  // For multi-word queries, match all words with prefix
  return words.map(w => `"${w}"*`).join(" ");
}

/**
 * Search a specific content type using FTS5
 * Returns matching row IDs
 */
export function searchContentIds(
  contentType: ContentType,
  query: string
): number[] {
  const ftsTable = ftsTableMap[contentType];
  if (!ftsTable) return [];
  
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];
  
  try {
    const stmt = rawDb.prepare(`SELECT rowid FROM ${ftsTable} WHERE ${ftsTable} MATCH ? ORDER BY rank`);
    const result = stmt.all(ftsQuery) as Array<{ rowid: number }>;
    return result.map(r => r.rowid);
  } catch (error) {
    console.error(`FTS5 search error for ${contentType}:`, error);
    return [];
  }
}

/**
 * Check if a query would match any results (for validation)
 */
export function hasSearchResults(
  contentType: ContentType,
  query: string
): boolean {
  const ids = searchContentIds(contentType, query);
  return ids.length > 0;
}

/**
 * Get highlighted snippets from FTS5 search results
 * Useful for showing search result previews
 */
export function searchWithSnippets(
  contentType: ContentType,
  query: string,
  snippetColumn: number = 1 // 0-indexed column to get snippet from
): Array<{ rowid: number; snippet: string }> {
  const ftsTable = ftsTableMap[contentType];
  if (!ftsTable) return [];
  
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];
  
  try {
    const stmt = rawDb.prepare(`
      SELECT rowid, snippet(${ftsTable}, ${snippetColumn}, '<mark>', '</mark>', '...', 32) as snippet
      FROM ${ftsTable}
      WHERE ${ftsTable} MATCH ?
      ORDER BY rank
      LIMIT 100
    `);
    const result = stmt.all(ftsQuery) as Array<{ rowid: number; snippet: string }>;
    return result;
  } catch (error) {
    console.error(`FTS5 snippet search error for ${contentType}:`, error);
    return [];
  }
}

/**
 * Rebuild FTS index for a content type (useful after bulk operations)
 */
export function rebuildFtsIndex(contentType: ContentType): void {
  const ftsTable = ftsTableMap[contentType];
  if (!ftsTable) return;
  
  try {
    rawDb.exec(`INSERT INTO ${ftsTable}(${ftsTable}) VALUES('rebuild')`);
  } catch (error) {
    console.error(`FTS5 rebuild error for ${contentType}:`, error);
  }
}
