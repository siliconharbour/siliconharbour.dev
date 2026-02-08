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
import { fetchPage, htmlToText, slugify, parseHtmlDocument, getNodeText } from "./utils";

const CAREERS_URL = "https://enaimco.com/careers/";

export async function scrapeEnaimco(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);
  const document = parseHtmlDocument(html);

  const availableHeading = Array.from(document.querySelectorAll("h2, h3, h4, h5")).find((node) =>
    /available positions/i.test(getNodeText(node)),
  );
  if (!availableHeading) return [];

  const applyHeading = Array.from(document.querySelectorAll("h2, h3, h4, h5")).find((node) =>
    /apply to work with us/i.test(getNodeText(node)),
  );

  const nodesInSection: Element[] = [];
  let cursor: Element | null = availableHeading.nextElementSibling;
  while (cursor && cursor !== applyHeading) {
    nodesInSection.push(cursor);
    cursor = cursor.nextElementSibling;
  }
  const sectionText = nodesInSection.map((node) => getNodeText(node)).join("\n");

  // If the section says there are no open positions, return empty
  if (/no\s+open\s+positions/i.test(sectionText)) {
    return [];
  }

  const jobs: FetchedJob[] = [];
  let currentTitle = "";
  let currentUrl = CAREERS_URL;
  let currentParts: string[] = [];
  const flushCurrent = () => {
    if (!currentTitle) return;
    const descriptionHtml = currentParts.join("\n").trim();
    jobs.push({
      externalId: slugify(currentTitle),
      title: currentTitle,
      location: "St. John's, NL",
      descriptionHtml: descriptionHtml || undefined,
      descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
      url: currentUrl,
    });
    currentTitle = "";
    currentUrl = CAREERS_URL;
    currentParts = [];
  };

  for (const node of nodesInSection) {
    if (/^H[2-5]$/.test(node.tagName)) {
      flushCurrent();
      const title = getNodeText(node);
      if (!title) continue;
      currentTitle = title;
      const link = node.querySelector('a[href^="http"], a[href^="/"]');
      const href = link?.getAttribute("href");
      if (href) {
        currentUrl = href.startsWith("http") ? href : new URL(href, CAREERS_URL).toString();
      }
      continue;
    }

    if (!currentTitle) continue;
    const htmlPart = node.outerHTML.trim();
    if (htmlPart) currentParts.push(htmlPart);
  }

  flushCurrent();

  return jobs;
}
