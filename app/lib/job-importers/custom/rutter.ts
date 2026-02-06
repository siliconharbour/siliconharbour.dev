/**
 * Rutter custom scraper
 *
 * WordPress + Divi theme site with WP REST API available.
 * The careers page content is at /wp-json/wp/v2/pages?slug=careers
 *
 * Jobs appear as <p><strong>Job Title</strong> followed by deadline info.
 * When no jobs are open, it shows "There are no open positions presently available."
 */

import type { FetchedJob } from "../types";
import { fetchJson, htmlToText, slugify } from "./utils";

const API_URL = "https://rutter.ca/wp-json/wp/v2/pages";

interface WPPage {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  link: string;
  modified: string;
}

export async function scrapeRutter(): Promise<FetchedJob[]> {
  const pages = await fetchJson<WPPage[]>(`${API_URL}?slug=careers`);
  if (!pages.length) return [];

  const content = pages[0].content.rendered;

  // Check if no positions available
  if (
    content.includes("no open positions presently available") ||
    content.includes("No open positions")
  ) {
    return [];
  }

  const jobs: FetchedJob[] = [];

  // Extract job titles from content
  // Pattern: <p><strong>Job Title<br /></strong> or <p><strong>Job Title</strong>
  // Skip known non-job strong text
  const jobRegex =
    /<p>\s*<strong>((?!Rutter Inc\.|There are no|Please)[^<]+?)(?:<br\s*\/?>)?\s*<\/strong>/gi;

  let match;
  while ((match = jobRegex.exec(content)) !== null) {
    const title = htmlToText(match[1]).trim();
    if (!title || title.length < 5) continue;

    // Look for a deadline after the title
    const afterTitle = content.substring(match.index, match.index + 500);
    const deadlineMatch = afterTitle.match(/Deadline:\s*([^<]+)/i);

    const externalId = slugify(title);

    jobs.push({
      externalId,
      title,
      location: "St. John's, NL",
      url: pages[0].link,
      postedAt: deadlineMatch ? undefined : new Date(pages[0].modified),
    });
  }

  return jobs;
}
