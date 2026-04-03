/**
 * Canadian Blood Services custom scraper
 *
 * CBS uses SAP SuccessFactors, which has no public API.
 * Strategy:
 *   1. Fetch the sitemap (https://careers.blood.ca/sitemap.xml) to get all job URLs.
 *   2. For each job page, check its microdata locations (schema.org PostalAddress
 *      itemprop elements) for St. John's, NL specifically.
 *   3. Fetch full job details only for matched jobs.
 *
 * This avoids the "Saint John, NB" false-positive that the locationsearch filter
 * produces — we match addressLocality="St. John's" + addressRegion="NL" exactly.
 */

import type { FetchedJob } from "../types";
import { fetchPage, htmlToText, parseHtmlDocument, getNodeText } from "./utils";

const SITEMAP_URL = "https://careers.blood.ca/sitemap.xml";
const JOB_URL_REGEX = /^https:\/\/careers\.blood\.ca\/job\//;

/**
 * Extract all job URLs from the CBS sitemap.
 */
async function fetchJobUrls(): Promise<string[]> {
  const xml = await fetchPage(SITEMAP_URL);
  const matches = xml.matchAll(/<loc>(https:\/\/careers\.blood\.ca\/job\/[^<]+)<\/loc>/g);
  const urls = new Set<string>();
  for (const m of matches) {
    if (JOB_URL_REGEX.test(m[1])) urls.add(m[1]);
  }
  return [...urls];
}

/**
 * Extract the numeric job ID from a CBS URL.
 * e.g. ".../Ottawa-Analyst-Business-Systems-III-ON-K1B-4S5/601173917/" → "601173917"
 */
function extractJobId(url: string): string | null {
  const match = url.match(/\/(\d+)\/?$/);
  return match ? match[1] : null;
}

interface JobPageData {
  title: string;
  locations: Array<{ city: string; region: string }>;
  descriptionHtml: string;
  descriptionText: string;
}

/**
 * Parse a CBS job page for title, all work locations, and description.
 */
function parseJobPage(html: string, _url: string): JobPageData | null {
  const doc = parseHtmlDocument(html);

  // Title — CBS uses <h1> or <h2> with class containing "job-title"
  const titleEl =
    doc.querySelector("h1") ??
    doc.querySelector(".job-title") ??
    doc.querySelector("[class*='jobTitle']");
  const title = titleEl ? getNodeText(titleEl) : "";
  if (!title) return null;

  // Locations — microdata itemprop="addressLocality" / addressRegion pairs
  // CBS embeds one PostalAddress block per allowed work location
  const localityEls = doc.querySelectorAll('[itemprop="addressLocality"]');
  const regionEls = doc.querySelectorAll('[itemprop="addressRegion"]');
  const locations: Array<{ city: string; region: string }> = [];
  const count = Math.min(localityEls.length, regionEls.length);
  for (let i = 0; i < count; i++) {
    const city = (localityEls[i].getAttribute("content") ?? "").trim();
    const region = (regionEls[i].getAttribute("content") ?? "").trim();
    if (city) locations.push({ city, region });
  }

  // Description — find the main job content area
  const descEl =
    doc.querySelector(".job-description") ??
    doc.querySelector("#job-description") ??
    doc.querySelector('[class*="description"]') ??
    doc.querySelector("article") ??
    doc.querySelector(".col-md-8") ??  // CBS uses Bootstrap grid
    doc.querySelector("main");

  const descriptionHtml = descEl?.innerHTML ?? "";
  const descriptionText = htmlToText(descriptionHtml);

  return { title, locations, descriptionHtml, descriptionText };
}

/**
 * Determine workplace type from job description text.
 */
function detectWorkplaceType(text: string): FetchedJob["workplaceType"] {
  const lower = text.toLowerCase();
  if (lower.includes("hybrid")) return "hybrid";
  if (lower.includes("remote")) return "remote";
  if (lower.includes("on-site") || lower.includes("onsite") || lower.includes("in person")) {
    return "onsite";
  }
  return undefined;
}

/**
 * Build a human-readable location string from CBS's multi-location list.
 * Shows St. John's first (since that's why we're including the job), followed
 * by a count of other locations if there are more.
 */
function formatLocations(locations: Array<{ city: string; region: string }>): string {
  const stjohns = locations.filter(
    (l) => l.city.toLowerCase().includes("st. john") && l.region === "NL",
  );
  const others = locations.filter(
    (l) => !(l.city.toLowerCase().includes("st. john") && l.region === "NL"),
  );

  if (stjohns.length === 0) return "St. John's, NL";

  const base = `St. John's, NL`;
  if (others.length === 0) return base;
  if (others.length === 1) return `${base} or ${others[0].city}, ${others[0].region}`;
  return `${base} + ${others.length} other locations`;
}

export async function scrapeCanadianBloodServices(
  _careersUrl: string = SITEMAP_URL,
): Promise<FetchedJob[]> {
  // Step 1: get all job URLs from the sitemap
  const jobUrls = await fetchJobUrls();

  const results: FetchedJob[] = [];

  // Step 2: check each job page for St. John's, NL work location
  // Fetch pages concurrently in small batches to avoid overwhelming the server
  const BATCH_SIZE = 5;
  for (let i = 0; i < jobUrls.length; i += BATCH_SIZE) {
    const batch = jobUrls.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        try {
          const jobId = extractJobId(url);
          if (!jobId) return null;

          const html = await fetchPage(url);
          const parsed = parseJobPage(html, url);
          if (!parsed) return null;

          // Only include jobs that list St. John's, NL as a work location
          const hasStJohns = parsed.locations.some(
            (l) => l.city.toLowerCase().includes("st. john") && l.region === "NL",
          );
          if (!hasStJohns) return null;

          const workplaceType = detectWorkplaceType(parsed.descriptionText);
          const location = formatLocations(parsed.locations);

          return {
            externalId: jobId,
            title: parsed.title,
            location,
            url,
            descriptionHtml: parsed.descriptionHtml,
            descriptionText: parsed.descriptionText,
            workplaceType,
          } satisfies FetchedJob;
        } catch {
          return null;
        }
      }),
    );

    for (const result of batchResults) {
      if (result) results.push(result);
    }
  }

  return results;
}
