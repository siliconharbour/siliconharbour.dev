/**
 * Vish custom scraper
 *
 * Vish careers are published on a marketing page with inline job sections.
 * Roles are represented by <h3> headings followed by rich content until the
 * next heading. The page also includes duplicate headings and an application
 * form section, both of which are filtered out here.
 */

import type { FetchedJob } from "../types";
import { fetchPage, htmlToText, slugify } from "./utils";

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

function isApplicationFormContent(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("enter your information below") ||
    normalized.includes("upload resume") ||
    normalized.includes("i agree to the privacy policy")
  );
}

export async function scrapeVish(careersUrl: string = DEFAULT_CAREERS_URL): Promise<FetchedJob[]> {
  const html = await fetchPage(careersUrl);
  const jobs: FetchedJob[] = [];
  const seenIds = new Set<string>();

  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const headings: Array<{ title: string; index: number }> = [];

  let match;
  while ((match = h3Regex.exec(html)) !== null) {
    const title = htmlToText(match[1]).trim();
    if (!title || isNonJobHeading(title)) {
      continue;
    }
    headings.push({ title, index: match.index });
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextIndex = i + 1 < headings.length ? headings[i + 1].index : html.length;
    const sectionHtml = html.substring(heading.index, nextIndex);
    const sectionText = htmlToText(sectionHtml);

    if (!sectionText || isApplicationFormContent(sectionText)) {
      continue;
    }

    // Require substantive section content to avoid nav/footer heading captures.
    if (sectionText.length < 120) {
      continue;
    }

    const externalId = slugify(heading.title);
    if (!externalId || seenIds.has(externalId)) {
      continue;
    }
    seenIds.add(externalId);

    jobs.push({
      externalId,
      title: heading.title,
      descriptionHtml: sectionHtml,
      descriptionText: sectionText,
      url: careersUrl,
    });
  }

  return jobs;
}
