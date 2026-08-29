/** Genesis official Webflow careers-page scraper. */

import type { FetchedJob } from "../types";
import { fetchPage, getNodeText, htmlToText, parseHtmlDocument, slugify } from "./utils";

const DEFAULT_CAREERS_URL = "https://www.genesiscentre.ca/careers";

export function parseGenesisCareers(
  html: string,
  careersUrl: string = DEFAULT_CAREERS_URL,
): FetchedJob[] {
  const document = parseHtmlDocument(html);
  const careers = document.querySelector("#careers");
  if (!careers) {
    throw new Error("Genesis careers section was not found; the page structure may have changed");
  }

  const jobs: FetchedJob[] = [];
  const seen = new Set<string>();

  for (const item of Array.from(careers.querySelectorAll(".w-dyn-item"))) {
    const link = item.querySelector("a[href]");
    const href = link?.getAttribute("href");
    const title = getNodeText(item.querySelector("h1, h2, h3, h4, h5"));
    if (!href || !title) continue;

    const url = new URL(href, careersUrl).toString();
    const externalId = slugify(url);
    if (!externalId || seen.has(externalId)) continue;
    seen.add(externalId);

    const descriptionHtml = item.innerHTML.trim();
    jobs.push({
      externalId,
      title,
      descriptionHtml: descriptionHtml || undefined,
      descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
      url,
    });
  }

  if (jobs.length > 0) return jobs;

  const emptyState = getNodeText(careers.querySelector(".w-dyn-empty"));
  if (/no items found/i.test(emptyState)) return [];

  throw new Error("Genesis careers page contained neither job listings nor its expected empty state");
}

export async function scrapeGenesis(careersUrl: string = DEFAULT_CAREERS_URL): Promise<FetchedJob[]> {
  const url = careersUrl || DEFAULT_CAREERS_URL;
  return parseGenesisCareers(await fetchPage(url), url);
}
