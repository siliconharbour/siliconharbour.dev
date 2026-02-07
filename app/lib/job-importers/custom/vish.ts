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

function isFooterHeading(title: string, attrs: string): boolean {
  const normalized = title.toLowerCase();
  const attrsNormalized = attrs.toLowerCase();
  return (
    attrsNormalized.includes("infobox_title") ||
    normalized === "phone us:" ||
    normalized === "email us:" ||
    normalized.includes("contact") ||
    normalized.includes("follow us")
  );
}

function isSectionHeading(title: string): boolean {
  const normalized = title.toLowerCase();
  return (
    normalized.includes("qualities") ||
    normalized.includes("experience") ||
    normalized.includes("responsibilities") ||
    normalized.includes("requirements") ||
    normalized.includes("qualifications") ||
    normalized.includes("what we offer") ||
    normalized.includes("about vish")
  );
}

function isLikelyJobTitle(title: string, attrs: string): boolean {
  const normalized = title.toLowerCase();
  if (!normalized || isNonJobHeading(title) || isFooterHeading(title, attrs) || isSectionHeading(title)) {
    return false;
  }

  if (normalized.endsWith(":")) {
    return false;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 14) {
    return false;
  }

  if (normalized.startsWith("join ")) {
    return true;
  }

  return /\b(engineer|developer|manager|director|lead|architect|analyst|specialist|representative|coordinator|designer|sales|marketing|operations|consultant)\b/i.test(title);
}

export async function scrapeVish(careersUrl: string = DEFAULT_CAREERS_URL): Promise<FetchedJob[]> {
  const html = await fetchPage(careersUrl);
  const jobs: FetchedJob[] = [];
  const seenIds = new Set<string>();

  const h3Regex = /<h3([^>]*)>([\s\S]*?)<\/h3>/gi;
  const headings: Array<{ title: string; attrs: string; index: number }> = [];

  let match;
  while ((match = h3Regex.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const title = htmlToText(match[2]).trim();
    if (!title || isNonJobHeading(title)) {
      continue;
    }
    headings.push({ title, attrs, index: match.index });
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    if (!isLikelyJobTitle(heading.title, heading.attrs)) {
      continue;
    }

    let endIndex = html.length;
    for (let j = i + 1; j < headings.length; j++) {
      const nextHeading = headings[j];
      if (isLikelyJobTitle(nextHeading.title, nextHeading.attrs) || isFooterHeading(nextHeading.title, nextHeading.attrs)) {
        endIndex = nextHeading.index;
        break;
      }
    }

    const sectionHtml = html.substring(heading.index, endIndex);
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
