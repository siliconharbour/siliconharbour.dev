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
import { fetchPage, htmlToText, slugify } from "./utils";

const CAREERS_URL = "https://bluedropism.com/careers/";

export async function scrapeBluedrop(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);
  const jobs: FetchedJob[] = [];

  // Primary approach: match azc_tsh_toggle blocks
  // Each toggle has a heading element and a content container
  const toggleRegex =
    /<div[^>]*class="[^"]*azc_tsh_toggle[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*azc_tsh_toggle[^"]*"|<\/section|$)/gi;

  let match;
  while ((match = toggleRegex.exec(html)) !== null) {
    const block = match[1];

    // Title is in the toggle heading - typically an <h3>, <h4>, or <p> inside the toggle header
    const titleMatch =
      block.match(/<(?:h[1-6]|p|span)[^>]*class="[^"]*azc_tsh_toggle_title[^"]*"[^>]*>([\s\S]*?)<\/(?:h[1-6]|p|span)>/i) ||
      block.match(/<(?:h[1-6])[^>]*>([\s\S]*?)<\/(?:h[1-6])>/i) ||
      block.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const title = htmlToText(titleMatch[1]).trim();
    if (!title) continue;

    // Description is in the toggle content container
    const contentMatch =
      block.match(/<div[^>]*class="[^"]*azc_tsh_toggle_container[^"]*"[^>]*>([\s\S]*)/i) ||
      block.match(/<div[^>]*class="[^"]*azc_tsh_contents[^"]*"[^>]*>([\s\S]*)/i);
    const descriptionHtml = contentMatch ? contentMatch[1].trim() : undefined;

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
    const jobsSectionMatch = html.match(
      /id="jobs"([\s\S]*?)(?=<\/section|Z)/i
    );
    if (jobsSectionMatch) {
      const section = jobsSectionMatch[1];
      const headingRegex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;

      let headingMatch;
      while ((headingMatch = headingRegex.exec(section)) !== null) {
        const title = htmlToText(headingMatch[1]).trim();
        if (!title) continue;

        // Skip generic headings
        if (/careers|jobs|openings|positions/i.test(title) && title.length < 30)
          continue;

        const externalId = slugify(title);

        jobs.push({
          externalId,
          title,
          location: "St. John's, NL",
          url: CAREERS_URL,
        });
      }
    }
  }

  return jobs;
}
