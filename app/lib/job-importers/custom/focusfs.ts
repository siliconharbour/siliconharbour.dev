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
import { fetchPage, htmlToText, slugify, parseHtmlDocument, getNodeText } from "./utils";

const CAREERS_URL = "https://focusfs.com/careers/";

export async function scrapeFocusfs(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);
  const document = parseHtmlDocument(html);
  const jobs: FetchedJob[] = [];

  const heading = Array.from(document.querySelectorAll("h2, h3")).find((node) =>
    /we['\u2019]?re\s+hiring/i.test(getNodeText(node)),
  );
  if (!heading) return jobs;

  let list: Element | null = heading.nextElementSibling;
  while (list && list.tagName !== "UL") {
    list = list.nextElementSibling;
  }
  if (!list) return jobs;

  for (const item of Array.from(list.querySelectorAll(":scope > li"))) {
    const strongTitle = item.querySelector("strong");
    const title = getNodeText(strongTitle);
    if (!title) continue;

    if (strongTitle) {
      strongTitle.remove();
    }
    const descriptionHtml = (item.innerHTML || "")
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
