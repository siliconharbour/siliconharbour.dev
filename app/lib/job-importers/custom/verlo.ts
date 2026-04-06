/**
 * Verlo custom scraper
 *
 * Static HTML careers page at verlo.finance/careers.html.
 * Job listings are anchor tags linking to individual detail pages
 * (e.g. customer-success-manager.html). Each card has a title in h3
 * and metadata spans for department, location, and employment type.
 *
 * Detail pages contain the full job description in a bordered section
 * with multiple subsections (intro, responsibilities, requirements, etc.)
 */

import type { FetchedJob } from "../types";
import { fetchPage, htmlToText, parseHtmlDocument, getNodeText } from "./utils";

const BASE_URL = "https://verlo.finance";
const DEFAULT_CAREERS_URL = `${BASE_URL}/careers.html`;

export async function scrapeVerlo(
  careersUrl: string = DEFAULT_CAREERS_URL,
): Promise<FetchedJob[]> {
  const html = await fetchPage(careersUrl);
  const document = parseHtmlDocument(html);
  const jobs: FetchedJob[] = [];

  // Job cards are <a> tags inside div.space-y-4 that link to detail pages
  const links = document.querySelectorAll("div.space-y-4 > a[href]");

  for (const link of Array.from(links)) {
    const href = link.getAttribute("href");
    if (!href || href.startsWith("mailto:") || href.startsWith("#")) continue;

    const title = getNodeText(link.querySelector("h3"));
    if (!title) continue;

    // Extract metadata spans: department · location · type
    const metaSpans = link.querySelectorAll(
      ".text-sm.text-stone-500 > span:not(.text-stone-300)",
    );
    const metaParts = Array.from(metaSpans).map((s) => getNodeText(s as Element));

    const department = metaParts[0] || undefined;
    const location = metaParts[1] || undefined;

    // Build the full URL for the detail page
    const jobUrl = new URL(href, careersUrl).toString();

    // Derive externalId from the filename slug (e.g. "customer-success-manager")
    const externalId = href
      .replace(/\.html$/, "")
      .split("/")
      .pop() || title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    // Fetch the detail page for full description
    let descriptionHtml: string | undefined;
    let descriptionText: string | undefined;
    try {
      const detailHtml = await fetchPage(jobUrl);
      const detailDoc = parseHtmlDocument(detailHtml);

      // Description lives inside div.border-t.border-stone-200
      const descSection = detailDoc.querySelector("div.border-t.border-stone-200");
      if (descSection) {
        descriptionHtml = (descSection as Element).innerHTML.trim();
        descriptionText = htmlToText(descriptionHtml);
      }
    } catch {
      // If detail page fails, still include the listing with what we have
    }

    jobs.push({
      externalId,
      title,
      department,
      location,
      descriptionHtml,
      descriptionText,
      url: jobUrl,
      workplaceType: "onsite",
    });
  }

  return jobs;
}
