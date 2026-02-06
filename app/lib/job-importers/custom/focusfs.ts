/**
 * Focus FS custom scraper
 *
 * WordPress site. The careers page lists general hiring categories
 * (e.g. "Product Engineering & DevOps", "Quality Assurance") rather than
 * individual job postings. Each category appears as a list item under a
 * "We're Hiring!" heading, with a bold title and a description of skills.
 *
 * Apply by sending resume to careers@focusfs.com.
 */

import type { FetchedJob } from "../types";
import { fetchPage, htmlToText, slugify } from "./utils";

const CAREERS_URL = "https://focusfs.com/careers/";

export async function scrapeFocusfs(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);
  const jobs: FetchedJob[] = [];

  // Find the "We're Hiring" section — the heading may contain HTML entities
  // like &#8217; for the apostrophe, or the literal Unicode right quote.
  // Look for the <ul> that follows it.
  const hiringMatch = html.match(
    /We(?:&#8217;|[\u2019\u0027'])re\s+Hiring[^<]*<\/h[23]>\s*(?:<p>[\s\S]*?<\/p>\s*)*<ul>([\s\S]*?)<\/ul>/i
  );
  if (!hiringMatch) return jobs;

  const listHtml = hiringMatch[1];

  // Extract each <li> — titles are in <strong> tags
  const liRegex = /<li>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = liRegex.exec(listHtml)) !== null) {
    const liContent = match[1];

    // Title is inside <strong>...</strong>
    const titleMatch = liContent.match(/<strong>([^<]+)<\/strong>/i);
    if (!titleMatch) continue;

    const title = htmlToText(titleMatch[1]).trim();
    if (!title) continue;

    // Description is the rest of the <li> after the </strong> tag
    // Strip leading HTML-encoded dashes (&#8211; = en-dash, &#8212; = em-dash)
    const descriptionHtml = liContent
      .replace(/<strong>[^<]*<\/strong>\s*/, "")
      .replace(/^(?:&#821[12];|[\u2013\u2014\-–—])\s*/, "")
      .trim();
    const descriptionText = htmlToText(descriptionHtml).trim();

    const externalId = slugify(title);

    jobs.push({
      externalId,
      title,
      location: "St. John's, NL",
      descriptionHtml: descriptionHtml || undefined,
      descriptionText: descriptionText || undefined,
      url: CAREERS_URL,
    });
  }

  return jobs;
}
