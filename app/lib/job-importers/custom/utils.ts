/**
 * Shared utilities for custom career page scrapers
 */

import type { FetchedJob } from "../types";

/**
 * Custom scraper function signature
 */
export type CustomScraper = (careersUrl: string) => Promise<FetchedJob[]>;

/**
 * Fetch a page's HTML content
 */
export async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

/**
 * Fetch JSON from a URL
 */
export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Strip HTML tags and decode entities to get plain text
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip WordPress Visual Composer / WPBakery shortcodes from content
 */
export function stripShortcodes(html: string): string {
  return html
    .replace(/\[\/?vc_\w+[^\]]*\]/g, "")
    .replace(/\[\/?et_pb_\w+[^\]]*\]/g, "")
    .replace(/\[\/?\w+_\w+[^\]]*\]/g, "")
    .trim();
}

/**
 * Generate a stable external ID from a URL or title
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
