/**
 * Shared utilities for custom career page scrapers
 */

import type { FetchedJob } from "../types";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { htmlToText as sharedHtmlToText, normalizeTextForDisplay } from "../text.server";

/**
 * Custom scraper function signature
 */
export type CustomScraper = (careersUrl: string) => Promise<FetchedJob[]>;
const execFileAsync = promisify(execFile);

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
 * Extract text from a PDF URL using `pdftotext`.
 * Returns null if extraction fails so callers can fall back gracefully.
 */
export async function extractPdfText(pdfUrl: string): Promise<string | null> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "netbenefit-pdf-"));
  const pdfPath = path.join(tempDir, "job.pdf");
  const textPath = path.join(tempDir, "job.txt");

  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      return null;
    }

    const data = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(pdfPath, data);

    await execFileAsync("pdftotext", [pdfPath, textPath]);
    const extracted = await fs.readFile(textPath, "utf8");
    const normalized = normalizeTextForDisplay(extracted);
    return normalized || null;
  } catch {
    return null;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Strip HTML tags and decode entities to get plain text
 */
export function htmlToText(html: string): string {
  return sharedHtmlToText(html);
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
