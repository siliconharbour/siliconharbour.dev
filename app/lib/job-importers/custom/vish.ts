/**
 * Vish custom scraper
 *
 * Vish careers are rendered as accordion "toggle" blocks in WordPress.
 * Each block has:
 * - title in h3.toggle-title > a.toggle-heading
 * - body in div.inner-toggle-wrap
 * - embedded Gravity Forms application form (which we strip)
 */

import type { FetchedJob } from "../types";
import { fetchPage, htmlToText, slugify, parseHtmlDocument, getNodeText } from "./utils";

const DEFAULT_CAREERS_URL = "https://getvish.com/careers/";

function isNonJobHeading(title: string): boolean {
  const normalized = title.toLowerCase();
  return (
    normalized === "interested?" ||
    normalized === "puestos disponibles" ||
    normalized.includes("current openings") ||
    normalized === "careers"
  );
}

function cleanJobTitle(title: string): string {
  return title.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

export async function scrapeVish(careersUrl: string = DEFAULT_CAREERS_URL): Promise<FetchedJob[]> {
  const html = await fetchPage(careersUrl);
  const document = parseHtmlDocument(html);
  const jobs: FetchedJob[] = [];
  const seenIds = new Set<string>();

  for (const toggle of Array.from(document.querySelectorAll("div.toggle.accent-color"))) {
    const title = cleanJobTitle(getNodeText(toggle.querySelector("h3.toggle-title a.toggle-heading")));
    if (!title || isNonJobHeading(title)) {
      continue;
    }

    const contentNode = toggle.querySelector("div.inner-toggle-wrap");
    if (!contentNode) {
      continue;
    }

    const contentClone = contentNode.cloneNode(true) as Element;
    for (const node of Array.from(contentClone.querySelectorAll("form, script"))) {
      node.remove();
    }

    const contentHtml = contentClone.innerHTML.trim();
    const contentText = htmlToText(contentHtml);

    if (!contentText || contentText.length < 80) continue;

    const externalId = slugify(title);
    if (!externalId || seenIds.has(externalId)) {
      continue;
    }
    seenIds.add(externalId);

    jobs.push({
      externalId,
      title,
      descriptionHtml: contentHtml,
      descriptionText: contentText,
      url: careersUrl,
    });
  }

  return jobs;
}
