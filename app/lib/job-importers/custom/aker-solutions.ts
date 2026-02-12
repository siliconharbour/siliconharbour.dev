/**
 * Aker Solutions custom scraper
 *
 * The listing page is filtered to Canada + St. John's. Parse direct job links
 * (`jobPostId`) and extract only clean, per-job fields from each card.
 */

import { parseHTML } from "linkedom";
import type { FetchedJob, WorkplaceType } from "../types";
import { fetchPage, htmlToText, slugify } from "./utils";

const DEFAULT_CAREERS_URL =
  "https://www.akersolutions.com/careers/job-search/?country=Canada&location=St.+John%27s";

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function extractJobPostId(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("jobPostId");
  } catch {
    return null;
  }
}

function cleanTitle(rawTitle: string): string {
  const normalized = normalizeText(rawTitle);
  const marker = normalized.match(/St\.?\s*John'?s,\s*Canada|Position:|Deadline:/i);
  const markerIndex = marker?.index ?? -1;

  return normalizeText(markerIndex > 0 ? normalized.slice(0, markerIndex) : normalized);
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

function extractLocation(text: string): string | undefined {
  const match = text.match(/St\.?\s*John'?s,\s*Canada/i);
  if (match) return "St. John's, Canada";
  return undefined;
}

function getCardText(anchor: Element): string {
  let current: Element | null = anchor;
  while (current) {
    if (current.className?.toString().toLowerCase().includes("job-item")) {
      return normalizeText(htmlToText(current.innerHTML || ""));
    }
    current = current.parentElement;
  }
  return "";
}

export async function scrapeAkerSolutions(careersUrl: string = DEFAULT_CAREERS_URL): Promise<FetchedJob[]> {
  const html = await fetchPage(careersUrl);
  const { document } = parseHTML(html);

  const jobsByExternalId = new Map<string, FetchedJob>();
  const anchors = document.querySelectorAll('a[href*="jobPostId="]');

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (!href) continue;

    const jobUrl = new URL(href, careersUrl).toString();
    const jobPostId = extractJobPostId(jobUrl);
    const externalId = jobPostId ? `jobpost-${jobPostId}` : slugify(jobUrl);
    if (!externalId || jobsByExternalId.has(externalId)) continue;

    const rawTitle = normalizeText(anchor.textContent || "");
    const title = cleanTitle(rawTitle);
    if (!title || title.length < 3 || title.length > 120) continue;

    const cardText = getCardText(anchor);
    const location = extractLocation(cardText) ?? "St. John's, Canada";

    // Safety guard: keep only St. John's listing results.
    if (!location.toLowerCase().includes("st. john")) continue;

    jobsByExternalId.set(externalId, {
      externalId,
      title,
      location,
      url: jobUrl,
      workplaceType: detectWorkplaceType(`${title} ${cardText}`),
    });
  }

  return [...jobsByExternalId.values()];
}
