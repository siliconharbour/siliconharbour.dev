/**
 * API utilities for JSON REST endpoints
 */

const SITE_URL = process.env.SITE_URL || "https://siliconharbour.dev";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Parse pagination params from URL search params
 */
export function parsePagination(url: URL): PaginationParams {
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");
  
  let limit = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;
  let offset = offsetParam ? parseInt(offsetParam, 10) : 0;
  
  // Clamp values
  if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  if (isNaN(offset) || offset < 0) offset = 0;
  
  return { limit, offset };
}

/**
 * Build Link header for pagination
 */
export function buildLinkHeader(
  baseUrl: string,
  pagination: PaginationParams,
  total: number
): string | null {
  const links: string[] = [];
  const { limit, offset } = pagination;
  
  // First page
  if (offset > 0) {
    links.push(`<${baseUrl}?limit=${limit}&offset=0>; rel="first"`);
  }
  
  // Previous page
  if (offset > 0) {
    const prevOffset = Math.max(0, offset - limit);
    links.push(`<${baseUrl}?limit=${limit}&offset=${prevOffset}>; rel="prev"`);
  }
  
  // Next page
  if (offset + limit < total) {
    const nextOffset = offset + limit;
    links.push(`<${baseUrl}?limit=${limit}&offset=${nextOffset}>; rel="next"`);
  }
  
  // Last page
  if (offset + limit < total) {
    const lastOffset = Math.floor((total - 1) / limit) * limit;
    links.push(`<${baseUrl}?limit=${limit}&offset=${lastOffset}>; rel="last"`);
  }
  
  return links.length > 0 ? links.join(", ") : null;
}

/**
 * Create a JSON response with proper headers
 */
export function jsonResponse<T>(
  data: T,
  options: {
    status?: number;
    linkHeader?: string | null;
  } = {}
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
  };
  
  if (options.linkHeader) {
    headers["Link"] = options.linkHeader;
  }
  
  return new Response(JSON.stringify(data), {
    status: options.status || 200,
    headers,
  });
}

/**
 * Transform image paths to full URLs
 */
export function imageUrl(filename: string | null): string | null {
  if (!filename) return null;
  return `${SITE_URL}/images/${filename}`;
}

/**
 * Transform content URLs
 */
export function contentUrl(type: string, slug: string): string {
  return `${SITE_URL}/${type}/${slug}`;
}
