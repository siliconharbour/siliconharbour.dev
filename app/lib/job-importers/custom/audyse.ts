/**
 * Audyse Industrial custom scraper
 *
 * Webflow CMS site with w-dyn-list collection items on the careers page.
 * Listing page has job links with titles and locations.
 * Detail pages have full job descriptions in clean HTML.
 */

import type { FetchedJob, WorkplaceType } from "../types";
import { fetchPage, htmlToText, parseHtmlDocument, getNodeText, slugify } from "./utils";
import pLimit from "p-limit";

const BASE_URL = "https://www.audyseindustrial.com";
const CAREERS_URL = `${BASE_URL}/careers`;

function detectWorkplaceType(locationText: string): WorkplaceType | undefined {
  const lower = locationText.toLowerCase();
  if (lower.includes("hybrid")) return "hybrid";
  if (lower.includes("remote")) return "remote";
  if (lower.includes("on-site") || lower.includes("onsite")) return "onsite";
  return undefined;
}

function cleanLocation(locationText: string): string {
  // Strip "(Hybrid)", "(Remote)", etc. from the location display
  return locationText.replace(/\s*\((?:hybrid|remote|on-?site)\)\s*/gi, "").trim();
}

export async function scrapeAudyse(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);
  const document = parseHtmlDocument(html);

  // Find all job links inside Webflow CMS collection items
  const jobLinks = document.querySelectorAll(".collection-item.w-dyn-item a.link-block");
  if (!jobLinks || jobLinks.length === 0) return [];

  const listings: { title: string; path: string; location: string }[] = [];

  for (const link of jobLinks) {
    const href = link.getAttribute("href");
    if (!href) continue;

    const titleEl = link.querySelector("h3");
    const title = titleEl ? getNodeText(titleEl).trim() : "";
    if (!title) continue;

    const locationEl = link.querySelector(".text-block-2");
    const location = locationEl ? getNodeText(locationEl).trim() : "";

    listings.push({ title, path: href, location });
  }

  // Fetch detail pages concurrently
  const limit = pLimit(3);
  const jobs: FetchedJob[] = [];

  await Promise.all(
    listings.map(({ title, path, location }) =>
      limit(async () => {
        const detailUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;

        try {
          const detailHtml = await fetchPage(detailUrl);
          const detailDoc = parseHtmlDocument(detailHtml);

          // The main content is in the rich text area after the heading
          const richText = detailDoc.querySelector(".w-richtext");
          const descriptionHtml = richText ? richText.innerHTML : undefined;

          jobs.push({
            externalId: slugify(title),
            title,
            location: cleanLocation(location) || "St. John's, NL",
            descriptionHtml: descriptionHtml || undefined,
            descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
            url: detailUrl,
            workplaceType: detectWorkplaceType(location),
          });
        } catch {
          // If detail fetch fails, still include the job with basic info
          jobs.push({
            externalId: slugify(title),
            title,
            location: cleanLocation(location) || "St. John's, NL",
            url: detailUrl,
            workplaceType: detectWorkplaceType(location),
          });
        }
      }),
    ),
  );

  return jobs;
}
