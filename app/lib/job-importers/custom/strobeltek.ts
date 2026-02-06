/**
 * StrobelTEK custom scraper
 *
 * WordPress + Elementor site. Jobs are listed inline on /careers-2/.
 * Each job has a "Position Title:" field followed by Location, Duration, etc.
 * No individual job pages - everything is on a single page.
 * WP REST API is blocked by ModSecurity.
 */

import type { FetchedJob } from "../types";
import { fetchPage, htmlToText, slugify } from "./utils";

const CAREERS_URL = "https://strobeltek.com/careers-2/";

export async function scrapeStrobeltek(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);
  const jobs: FetchedJob[] = [];

  // Split on "Position Title:" to find each job block
  const sections = html.split(/Position Title:\s*<\/b>/i);

  // First section is everything before the first job, skip it
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];

    // Title is right after "Position Title: </b>" - in a <b> tag or plain text
    const titleMatch = section.match(/^\s*(?:<b>)?\s*([^<]+)/i);
    if (!titleMatch) continue;

    const title = htmlToText(titleMatch[1]).trim();
    if (!title) continue;

    // Extract location
    const locationMatch = section.match(
      /Location:\s*<\/b>\s*(?:<b>)?\s*([^<]+)/i
    );
    const location = locationMatch
      ? htmlToText(locationMatch[1]).replace(/\([^)]*\)/g, "").trim()
      : undefined;

    // Extract duration
    const durationMatch = section.match(
      /Duration:\s*<\/b>\s*(?:<b>)?\s*([^<]+)/i
    );

    // Build description - take everything up to the next "Position Title" or end
    // Limit to a reasonable chunk
    const descriptionHtml = section.substring(0, 5000);

    const externalId = slugify(title);

    jobs.push({
      externalId,
      title,
      location,
      department: durationMatch ? htmlToText(durationMatch[1]).trim() : undefined,
      descriptionHtml: descriptionHtml || undefined,
      descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
      url: CAREERS_URL,
    });
  }

  return jobs;
}
