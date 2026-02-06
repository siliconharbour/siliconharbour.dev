/**
 * Compusult custom scraper
 *
 * Liferay CMS site. Jobs are listed on /careers in structured content blocks.
 * Each job appears after an "Opportunity Available:" heading as:
 * - <h3> with job title (often wrapped in <span class="text-info">)
 * - <strong>Location: ...</strong> paragraph
 * - Description with Responsibilities, Qualifications, Compensation sections
 * - "Apply Now" mailto button to careers@compusult.com
 *
 * Jobs are inside `component-paragraph` divs with `data-lfr-editable-type="rich-text"`.
 * Multiple jobs may appear sequentially within the same container.
 */

import type { FetchedJob } from "../types";
import { fetchPage, htmlToText, slugify } from "./utils";

const CAREERS_URL = "https://www.compusult.com/careers";

export async function scrapeCompusult(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);
  const jobs: FetchedJob[] = [];

  // Find the "Opportunity Available:" section - jobs come after this
  const opportunityIdx = html.indexOf("Opportunity Available:");
  if (opportunityIdx === -1) return [];

  const jobsHtml = html.substring(opportunityIdx);

  // Extract rich-text content blocks that contain job data
  // These are inside: <div class="clearfix component-paragraph text-break" data-lfr-editable-id="element-text" data-lfr-editable-type="rich-text">...</div>
  const blockRegex =
    /data-lfr-editable-type="rich-text">([\s\S]*?)<\/div><\/div>(?:<style>|<\/div>)/g;

  // Collect all rich-text blocks after "Opportunity Available:"
  const blocks: string[] = [];
  let match;
  while ((match = blockRegex.exec(jobsHtml)) !== null) {
    blocks.push(match[1]);
  }

  // Identify job title blocks - they contain <h3> tags
  // Then pair each title block with its description block(s)
  let currentTitle: string | null = null;
  let currentLocation: string | undefined;
  let descriptionParts: string[] = [];

  for (const block of blocks) {
    const h3Match = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);

    if (h3Match) {
      // If we already have a job in progress, save it
      if (currentTitle) {
        const descriptionHtml = descriptionParts.join("\n") || undefined;
        jobs.push({
          externalId: slugify(currentTitle),
          title: currentTitle,
          location: currentLocation,
          descriptionHtml,
          descriptionText: descriptionHtml
            ? htmlToText(descriptionHtml)
            : undefined,
          url: CAREERS_URL,
        });
      }

      // Start a new job
      currentTitle = htmlToText(h3Match[1]).trim();
      descriptionParts = [];

      // Check for location in the same block (after the h3)
      const locationMatch = block.match(
        /Location:\s*([^<]+)/i,
      );
      currentLocation = locationMatch
        ? htmlToText(locationMatch[1]).trim()
        : undefined;

      // If there's content after the h3 and location, include it as description
      const afterH3 = block.substring(
        block.indexOf("</h3>") + 5,
      );
      // Strip out just the location paragraph to avoid duplication
      const descContent = afterH3
        .replace(/<p>\s*<strong>\s*Location:[^<]*<\/strong>\s*<\/p>/i, "")
        .trim();
      if (descContent) {
        descriptionParts.push(descContent);
      }
    } else if (currentTitle && block.trim()) {
      // This is a description block for the current job
      descriptionParts.push(block);
    }
  }

  // Don't forget the last job
  if (currentTitle) {
    const descriptionHtml = descriptionParts.join("\n") || undefined;
    jobs.push({
      externalId: slugify(currentTitle),
      title: currentTitle,
      location: currentLocation,
      descriptionHtml,
      descriptionText: descriptionHtml
        ? htmlToText(descriptionHtml)
        : undefined,
      url: CAREERS_URL,
    });
  }

  return jobs;
}
