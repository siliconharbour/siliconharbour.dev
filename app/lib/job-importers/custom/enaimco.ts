/**
 * Enaimco custom scraper
 *
 * WordPress site with ACF flexible content (not standard WP content).
 * The careers page at /careers/ has an "Available Positions" section
 * followed by job listings. When no jobs are posted, it shows
 * "We currently have no open positions."
 *
 * Jobs appear as HTML blocks between the "Available Positions" heading
 * and the "Apply To Work With Us" section. Each job is expected to be
 * a heading (h2-h5) with a title, followed by description content.
 */

import type { FetchedJob } from "../types";
import { fetchPage, htmlToText, slugify } from "./utils";

const CAREERS_URL = "https://enaimco.com/careers/";

export async function scrapeEnaimco(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);

  // Extract the "Available Positions" section content.
  // It sits between the <h4>Available Positions</h4> heading and the
  // next "Apply To Work With Us" section.
  const sectionMatch = html.match(
    /Available Positions<\/h4>([\s\S]*?)(?:<h4>Apply To Work With Us|<section)/i
  );
  if (!sectionMatch) return [];

  const section = sectionMatch[1];

  // If the section says there are no open positions, return empty
  if (/no\s+open\s+positions/i.test(section)) {
    return [];
  }

  const jobs: FetchedJob[] = [];

  // Split on headings (h2-h5) to find individual job blocks.
  // Each heading is expected to be a job title.
  const jobBlocks = section.split(/<h[2-5][^>]*>/i);

  // First element is content before the first heading, skip it
  for (let i = 1; i < jobBlocks.length; i++) {
    const block = jobBlocks[i];

    // Title is the text content of the heading (up to closing tag)
    const titleMatch = block.match(/^([\s\S]*?)<\/h[2-5]>/i);
    if (!titleMatch) continue;

    const title = htmlToText(titleMatch[1]).trim();
    if (!title) continue;

    // Description is everything after the closing heading tag
    const descStart = block.indexOf(titleMatch[0]) + titleMatch[0].length;
    const descriptionHtml = block.substring(descStart).trim();

    // Check for a link to a dedicated job page
    const linkMatch = block.match(/href="(https?:\/\/enaimco\.com\/[^"]*?)"/i);
    const jobUrl = linkMatch ? linkMatch[1] : CAREERS_URL;

    const externalId = slugify(title);

    jobs.push({
      externalId,
      title,
      location: "St. John's, NL",
      descriptionHtml: descriptionHtml || undefined,
      descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
      url: jobUrl,
    });
  }

  return jobs;
}
