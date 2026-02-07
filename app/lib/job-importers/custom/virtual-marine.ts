/**
 * Virtual Marine custom scraper
 *
 * Squarespace site. Job listings are on /careers in flat rich text.
 * Job titles are in <h3> tags containing <strong><em> or <em> wrapped text.
 * The <h3> tags on this page may contain the title text across inner elements.
 *
 * Note: All mailto links share the same subject line (copy-paste error on
 * their end), so titles are extracted from <h3> text only.
 */

import type { FetchedJob } from "../types";
import { fetchPage, htmlToText, slugify } from "./utils";

const CAREERS_URL = "https://www.virtualmarine.ca/careers";

function detectWorkplaceType(text: string): "remote" | undefined {
  const normalized = text.toLowerCase();
  if (!normalized.includes("remote")) {
    return undefined;
  }
  return "remote";
}

export async function scrapeVirtualMarine(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);
  const jobs: FetchedJob[] = [];

  // Find all h3 tags with their full content (including inner HTML)
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const h3s: Array<{ text: string; index: number }> = [];

  let match;
  while ((match = h3Regex.exec(html)) !== null) {
    const text = htmlToText(match[1]).trim();
    if (text) {
      h3s.push({ text, index: match.index });
    }
  }

  for (let i = 0; i < h3s.length; i++) {
    let title = h3s[i].text;

    // Skip non-job headings
    if (
      title.toLowerCase().includes("careers at") ||
      title.toLowerCase().includes("virtual marine") && !title.toLowerCase().includes("at virtual marine") === false ||
      title.length < 3
    )
      continue;

    // Skip section headings that aren't job titles
    if (
      title === "Careers" ||
      title.startsWith("WHO ") ||
      title.startsWith("WHAT ")
    )
      continue;

    // Strip "(new)" suffix
    title = title.replace(/\s*\(new\)\s*$/i, "").trim();
    if (!title) continue;

    // Get the content between this h3 and the next h3
    const startIdx = h3s[i].index;
    const endIdx = i + 1 < h3s.length ? h3s[i + 1].index : html.length;
    const sectionHtml = html.substring(startIdx, endIdx);

    // Check if this section contains "THE ROLE:" - that confirms it's a job
    if (!sectionHtml.includes("THE ROLE") && !sectionHtml.includes("mailto:careers")) {
      continue;
    }

    // Extract description (everything after the h3 close)
    const h3Close = sectionHtml.indexOf("</h3>");
    const descriptionHtml = h3Close > -1 ? sectionHtml.substring(h3Close + 5, 8000).trim() : "";
    const descriptionText = descriptionHtml ? htmlToText(descriptionHtml) : undefined;
    const workplaceType = detectWorkplaceType(`${title} ${descriptionText ?? ""}`);

    const externalId = slugify(title);

    jobs.push({
      externalId,
      title,
      location: "St. John's, NL",
      descriptionHtml: descriptionHtml || undefined,
      descriptionText,
      url: CAREERS_URL,
      workplaceType,
    });
  }

  return jobs;
}
