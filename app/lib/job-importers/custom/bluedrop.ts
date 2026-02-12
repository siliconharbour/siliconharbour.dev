/**
 * Bluedrop ISM custom scraper
 *
 * WordPress + Elementor site using the "azurecurve-toggle-showhide" plugin.
 * Jobs are listed on /careers/ inside toggle/accordion sections.
 * Each toggle heading (azc_tsh_toggle) contains a job title, and the
 * associated toggle content contains the job description HTML.
 *
 * Falls back to h2/h3 headings in the jobs section if no toggle elements found.
 */

import type { FetchedJob } from "../types";
import { fetchPage, htmlToText, slugify, parseHtmlDocument, getNodeText } from "./utils";

const CAREERS_URL = "https://bluedropism.com/careers/";

function isNonJobHeading(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  return (
    normalized === "our current opportunities" ||
    normalized === "current opportunities" ||
    normalized === "available positions" ||
    normalized === "open positions" ||
    normalized === "career opportunities" ||
    normalized === "careers" ||
    normalized === "jobs" ||
    /^no (current )?(jobs|openings|positions|opportunities)/.test(normalized)
  );
}

export async function scrapeBluedrop(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);
  const document = parseHtmlDocument(html);
  const jobs: FetchedJob[] = [];

  for (const toggle of Array.from(document.querySelectorAll(".azc_tsh_toggle"))) {
    const title = getNodeText(
      toggle.querySelector(".azc_tsh_toggle_title, h1, h2, h3, h4, h5, h6, a"),
    );
    if (!title) continue;
    if (isNonJobHeading(title)) continue;

    const contentNode = toggle.querySelector(".azc_tsh_toggle_container, .azc_tsh_contents");
    const descriptionHtml = contentNode?.innerHTML?.trim();

    const externalId = slugify(title);

    jobs.push({
      externalId,
      title,
      location: "St. John's, NL",
      descriptionHtml: descriptionHtml || undefined,
      descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
      url: CAREERS_URL,
    });
  }

  // Fallback: look for h2/h3 headings in the jobs section if no toggles found
  if (jobs.length === 0) {
    const section = document.querySelector("#jobs");
    if (section) {
      for (const heading of Array.from(section.querySelectorAll("h2, h3"))) {
        const title = getNodeText(heading);
        if (!title) continue;
        if (isNonJobHeading(title)) continue;
        jobs.push({
          externalId: slugify(title),
          title,
          location: "St. John's, NL",
          url: CAREERS_URL,
        });
      }
    }
  }

  return jobs;
}
