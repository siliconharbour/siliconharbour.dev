/**
 * Vish custom scraper
 *
 * Vish careers are rendered as accordion "toggle" blocks in WordPress.
 * Each block has:
 * - title in h3.toggle-title > a.toggle-heading
 * - body in div.inner-toggle-wrap
 * - embedded Gravity Forms application form (which we strip)
 */

import type { FetchedJob } from "../types";
import { fetchPage, htmlToText, slugify } from "./utils";

const DEFAULT_CAREERS_URL = "https://getvish.com/careers/";

function isNonJobHeading(title: string): boolean {
  const normalized = title.toLowerCase();
  return (
    normalized === "interested?" ||
    normalized === "puestos disponibles" ||
    normalized.includes("current openings") ||
    normalized === "careers"
  );
}

function cleanJobTitle(title: string): string {
  return title.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

export async function scrapeVish(careersUrl: string = DEFAULT_CAREERS_URL): Promise<FetchedJob[]> {
  const html = await fetchPage(careersUrl);
  const jobs: FetchedJob[] = [];
  const seenIds = new Set<string>();

  const toggleRegex = /<div class="toggle accent-color"[\s\S]*?(?=<div class="toggle accent-color"|<h3 class="infobox_title"|<\/body>)/gi;
  const blocks = html.match(toggleRegex) ?? [];

  for (const block of blocks) {
    const titleMatch = block.match(
      /<h3 class="toggle-title">[\s\S]*?<a[^>]*class="[^"]*toggle-heading[^"]*"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!titleMatch) {
      continue;
    }

    const title = cleanJobTitle(htmlToText(titleMatch[1]));
    if (!title || isNonJobHeading(title)) {
      continue;
    }

    const innerMatch = block.match(
      /<div class="inner-toggle-wrap">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i
    );
    if (!innerMatch) {
      continue;
    }

    const contentHtml = innerMatch[1]
      .replace(/<form[\s\S]*?<\/form>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .trim();
    const contentText = htmlToText(contentHtml);

    if (!contentText || contentText.length < 80) continue;

    const externalId = slugify(title);
    if (!externalId || seenIds.has(externalId)) {
      continue;
    }
    seenIds.add(externalId);

    jobs.push({
      externalId,
      title,
      descriptionHtml: contentHtml,
      descriptionText: contentText,
      url: careersUrl,
    });
  }

  return jobs;
}
