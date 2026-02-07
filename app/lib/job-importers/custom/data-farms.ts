/**
 * Data Farms custom scraper
 *
 * Careers listing is rendered in Elementor with "Current Opportunities" cards.
 * Each card links to a dedicated job detail page with fuller description text.
 */

import { parseHTML } from "linkedom";
import type { FetchedJob, WorkplaceType } from "../types";
import { fetchPage, htmlToText, slugify } from "./utils";

const CAREERS_URL = "https://datafarms.ca/careers/";

function normalize(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function detectWorkplaceType(text: string): WorkplaceType | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("hybrid")) return "hybrid";
  if (lower.includes("remote")) return "remote";
  if (lower.includes("on-site") || lower.includes("onsite") || lower.includes("on site")) {
    return "onsite";
  }
  return undefined;
}

function parseLocation(meta: string): string | undefined {
  const normalized = normalize(meta);
  const explicit = normalized.match(/(?:location|office location)\s*:\s*([^|]+)$/i);
  if (explicit?.[1]) return normalize(explicit[1]);

  if (normalized.toLowerCase().includes("st. john")) {
    return "St. John's, NL";
  }
  return undefined;
}

function extractDescriptionFromDetailPage(html: string): { descriptionHtml?: string; descriptionText?: string } {
  const { document } = parseHTML(html);
  const main = document.querySelector("main#content");
  if (!main) return {};

  const blocks = [...main.querySelectorAll(".elementor-widget-text-editor")]
    .map((node) => node.innerHTML?.trim() ?? "")
    .filter(Boolean);
  if (blocks.length === 0) return {};

  const combinedHtml = blocks.join("\n");
  const combinedText = htmlToText(combinedHtml);

  return {
    descriptionHtml: combinedHtml || undefined,
    descriptionText: combinedText || undefined,
  };
}

export async function scrapeDataFarms(careersUrl: string = CAREERS_URL): Promise<FetchedJob[]> {
  const html = await fetchPage(careersUrl);
  const { document } = parseHTML(html);

  const jobs: FetchedJob[] = [];
  const seen = new Set<string>();

  const headings = [...document.querySelectorAll("h3.elementor-heading-title")];
  for (const heading of headings) {
    const title = normalize(heading.textContent);
    if (!title) continue;

    const section = heading.closest("section.elementor-inner-section");
    if (!section) continue;

    const applyAnchor = section.querySelector("a.elementor-button-link");
    const href = applyAnchor?.getAttribute("href");
    if (!href) continue;

    const jobUrl = new URL(href, careersUrl).toString();
    const externalId = slugify(jobUrl) || slugify(title);
    if (!externalId || seen.has(externalId)) continue;

    const metaTextNode = section.querySelector(".elementor-widget-text-editor");
    const metaText = normalize(metaTextNode ? htmlToText(metaTextNode.innerHTML || "") : "");
    const workplaceType = detectWorkplaceType(metaText);
    const location = parseLocation(metaText);

    let descriptionHtml: string | undefined;
    let descriptionText: string | undefined;
    try {
      const detailHtml = await fetchPage(jobUrl);
      const detail = extractDescriptionFromDetailPage(detailHtml);
      descriptionHtml = detail.descriptionHtml;
      descriptionText = detail.descriptionText;
    } catch {
      // If details fail, keep listing-derived metadata only.
    }

    seen.add(externalId);
    jobs.push({
      externalId,
      title,
      location,
      descriptionHtml,
      descriptionText,
      url: jobUrl,
      workplaceType,
    });
  }

  return jobs;
}
