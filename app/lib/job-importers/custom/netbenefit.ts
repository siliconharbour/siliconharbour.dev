/**
 * NetBenefit Software custom scraper
 *
 * Webflow CMS collection list. Jobs are in w-dyn-item elements with:
 * - Title in div.h4
 * - Description in p.paragraph
 * - PDF link to full job description
 * - Mailto link with job title in subject
 *
 * The w-dyn-* class pattern is standard Webflow and very stable.
 */

import type { FetchedJob } from "../types";
import { fetchPage, htmlToText, slugify, extractPdfText } from "./utils";

const CAREERS_URL = "https://www.netbenefitsoftware.com/careers";

export async function scrapeNetbenefit(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);
  const jobs: FetchedJob[] = [];

  // Match each w-dyn-item (job listing block)
  const itemRegex = /role="listitem"[^>]*class="[^"]*w-dyn-item[^"]*"[^>]*>([\s\S]*?)(?=role="listitem"|<\/div>\s*<\/div>\s*<\/div>\s*<\/section)/gi;

  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[1];

    // Extract title from div.h4
    const titleMatch = block.match(/<div class="h4">([\s\S]*?)<\/div>/i);
    if (!titleMatch) continue;
    const title = htmlToText(titleMatch[1]).trim();
    if (!title) continue;

    // Extract description from p.paragraph
    const descMatch = block.match(/<p class="paragraph">([\s\S]*?)<\/p>/i);
    const description = descMatch ? descMatch[1] : undefined;

    // Extract PDF link
    const pdfMatch = block.match(/href="(https:\/\/cdn[^"]+\.pdf)"/i);
    const pdfUrl = pdfMatch ? pdfMatch[1] : undefined;

    // Extract mailto subject (serves as canonical title)
    const mailtoMatch = block.match(
      /mailto:careers@netbenefitsoftware\.com\?subject=([^"]+)/i
    );

    const externalId = slugify(
      mailtoMatch ? decodeURIComponent(mailtoMatch[1]) : title
    );

    const snippetText = description ? htmlToText(description) : "";
    const pdfText = pdfUrl ? await extractPdfText(pdfUrl) : null;
    const descriptionText = [snippetText, pdfText].filter(Boolean).join("\n\n").trim() || undefined;

    jobs.push({
      externalId,
      title,
      location: "St. John's, NL",
      descriptionHtml: description || undefined,
      descriptionText,
      url: pdfUrl || CAREERS_URL,
    });
  }

  return jobs;
}
