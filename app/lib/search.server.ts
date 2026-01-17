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

// Source table and primary searchable column for LIKE fallback
// Used when query is too short for trigram (< 3 chars)
const sourceTableMap: Record<ContentType, { table: string; column: string }> = {
  event: { table: "events", column: "title" },
  company: { table: "companies", column: "name" },
  group: { table: "groups", column: "name" },
  learning: { table: "learning", column: "name" },
  person: { table: "people", column: "name" },
  news: { table: "news", column: "title" },
  job: { table: "jobs", column: "title" },
  project: { table: "projects", column: "name" },
  product: { table: "products", column: "name" },
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
 * Check if query needs LIKE fallback (any word < 3 chars)
 * Trigram tokenizer requires at least 3 characters per term
 */
function needsLikeFallback(query: string): boolean {
  const escaped = escapeFtsQuery(query);
  if (!escaped) return false;
  
  const words = escaped.split(" ").filter(w => w.length > 0);
  return words.some(w => w.length < 3);
}

/**
 * Build an FTS5 match query from user input
 * With trigram tokenizer, we don't need prefix matching - substring matching is native
 */
function buildFtsQuery(query: string): string {
  const escaped = escapeFtsQuery(query);
  if (!escaped) return "";
  
  // With trigram tokenizer, just quote each term for exact substring matching
  // Split into words and quote each one
  const words = escaped.split(" ").filter(w => w.length > 0);
  
  // Quote each word for exact matching
  // For multi-word queries, all terms must match (implicit AND)
  return words.map(w => `"${w}"`).join(" ");
}

/**
 * Search using LIKE for short queries (< 3 chars)
 * Falls back to searching the primary column of the source table
 */
function searchWithLike(
  contentType: ContentType,
  query: string
): number[] {
  const source = sourceTableMap[contentType];
  if (!source) return [];
  
  const escaped = escapeFtsQuery(query);
  if (!escaped) return [];
  
  try {
    // Search with LIKE on the primary column (case-insensitive)
    const pattern = `%${escaped}%`;
    const stmt = rawDb.prepare(
      `SELECT id FROM ${source.table} WHERE ${source.column} LIKE ? COLLATE NOCASE ORDER BY ${source.column} LIMIT 100`
    );
    const result = stmt.all(pattern) as Array<{ id: number }>;
    return result.map(r => r.id);
  } catch (error) {
    console.error(`LIKE search error for ${contentType}:`, error);
    return [];
  }
}

/**
 * Search a specific content type using FTS5 (or LIKE for short queries)
 * Returns matching row IDs
 */
export function searchContentIds(
  contentType: ContentType,
  query: string
): number[] {
  // For short queries (< 3 chars), use LIKE fallback since trigram needs 3+ chars
  if (needsLikeFallback(query)) {
    return searchWithLike(contentType, query);
  }
  
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
