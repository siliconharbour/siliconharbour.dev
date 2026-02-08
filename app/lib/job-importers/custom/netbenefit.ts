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
import { fetchPage, htmlToText, slugify, extractPdfText, parseHtmlDocument, getNodeText } from "./utils";

const CAREERS_URL = "https://www.netbenefitsoftware.com/careers";

export async function scrapeNetbenefit(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);
  const document = parseHtmlDocument(html);
  const jobs: FetchedJob[] = [];

  for (const item of Array.from(document.querySelectorAll('[role="listitem"].w-dyn-item'))) {
    const title = getNodeText(item.querySelector("div.h4"));
    if (!title) continue;

    const description = item.querySelector("p.paragraph")?.innerHTML?.trim();
    const pdfUrl =
      item.querySelector('a[href*="cdn"][href$=".pdf"]')?.getAttribute("href") ?? undefined;
    const mailtoHref = item
      .querySelector('a[href^="mailto:careers@netbenefitsoftware.com"]')
      ?.getAttribute("href");
    const mailtoSubject = mailtoHref ? new URL(mailtoHref).searchParams.get("subject") : null;

    const externalId = slugify(
      mailtoSubject ? decodeURIComponent(mailtoSubject) : title,
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
