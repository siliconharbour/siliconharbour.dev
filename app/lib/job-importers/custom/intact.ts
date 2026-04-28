/**
 * Intact Financial custom scraper
 *
 * Scrapes careers.intactfc.com (Paradox.ai platform).
 * The site is server-side rendered HTML with JSON-LD structured data on detail pages.
 *
 * Strategy:
 *   1. Paginate through listing pages, extract job links and primary locations
 *   2. For jobs with NL primary location or "+More Locations", fetch detail page
 *   3. Parse JSON-LD from detail page for full description and location data
 *   4. Keep only jobs that have a Newfoundland location
 */

import type { FetchedJob } from "../types";
import { htmlToText, fetchPage } from "./utils";
import { parseHTML } from "linkedom";
import pLimit from "p-limit";

const BASE_URL = "https://careers.intactfc.com";
const MAX_PAGES = 20; // 10 jobs per page, ~200 jobs max

// -- Types -------------------------------------------------------------------

interface JobListing {
  title: string;
  href: string;
  primaryLocation: string;
  hasMoreLocations: boolean;
  reqId: string;
}

interface JsonLdJobPosting {
  title: string;
  description: string;
  url: string;
  datePosted: string;
  employmentType: string[];
  identifier: { value: string };
  jobLocation: Array<{
    address: {
      streetAddress: string;
      addressLocality: string;
      addressRegion: string;
      postalCode: string;
      addressCountry: string;
    };
  }>;
  baseSalary?: {
    value: {
      minValue: number;
      maxValue: number;
      unitText: string;
    };
    currency: string;
  };
}

// -- Helpers -----------------------------------------------------------------

function isNlLocation(location: string): boolean {
  const lower = location.toLowerCase();
  return (
    lower.includes(", nl") ||
    lower.includes("newfoundland") ||
    lower.includes("st. john")
  );
}

/**
 * Parse a listing page and extract job entries.
 */
function parseListingPage(html: string): JobListing[] {
  const { document } = parseHTML(html);
  const items = document.querySelectorAll(".results-list__item");
  const jobs: JobListing[] = [];

  for (const item of items) {
    const linkEl = item.querySelector(".results-list__item-title--link");
    if (!linkEl) continue;

    const title = linkEl.textContent?.trim() ?? "";
    const href = linkEl.getAttribute("href") ?? "";
    const locLabel = item.querySelector(".results-list__item-street--label")?.textContent?.trim() ?? "";
    const moreLocations = item.querySelector(".results-list__item-street--more-locations");

    // Extract req ID from the info spans
    const spans = item.querySelectorAll(".results-list__item-info span");
    let reqId = "";
    for (const span of spans) {
      const text = span.textContent?.trim() ?? "";
      if (/^R\d+$/.test(text)) {
        reqId = text;
        break;
      }
    }

    jobs.push({
      title,
      href,
      primaryLocation: locLabel,
      hasMoreLocations: !!moreLocations,
      reqId,
    });
  }

  return jobs;
}

/**
 * Check if a listing page has a next page link.
 */
function hasNextPage(html: string, currentPage: number): boolean {
  return html.includes(`/jobs/page/${currentPage + 1}`);
}

/**
 * Parse JSON-LD from a job detail page.
 */
function parseJobDetailJsonLd(html: string): JsonLdJobPosting | null {
  const { document } = parseHTML(html);
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? "");
      if (data["@type"] === "JobPosting") {
        return data as JsonLdJobPosting;
      }
    } catch {
      // skip malformed JSON-LD
    }
  }

  return null;
}

/**
 * Check if a job posting has any NL locations.
 */
function hasNlJobLocation(jsonLd: JsonLdJobPosting): boolean {
  return jsonLd.jobLocation?.some(
    (loc) =>
      loc.address?.addressRegion === "NL" ||
      isNlLocation(loc.address?.addressLocality ?? ""),
  ) ?? false;
}

function buildLocation(jsonLd: JsonLdJobPosting): string | undefined {
  if (!jsonLd.jobLocation || jsonLd.jobLocation.length === 0) return undefined;
  return jsonLd.jobLocation
    .map((loc) => {
      const city = loc.address?.addressLocality ?? "";
      const region = loc.address?.addressRegion ?? "";
      return [city, region].filter(Boolean).join(", ");
    })
    .join("; ");
}

function buildSalaryRange(jsonLd: JsonLdJobPosting): string | undefined {
  const salary = jsonLd.baseSalary;
  if (!salary?.value?.minValue && !salary?.value?.maxValue) return undefined;
  if (salary.value.minValue === 0 && salary.value.maxValue === 0) return undefined;
  const currency = salary.currency || "CAD";
  const min = salary.value.minValue;
  const max = salary.value.maxValue;
  if (min && max) return `${currency} ${min.toLocaleString()} - ${max.toLocaleString()}`;
  if (min) return `${currency} ${min.toLocaleString()}+`;
  return undefined;
}

// -- Scraper -----------------------------------------------------------------

export async function scrapeIntact(): Promise<FetchedJob[]> {
  // Phase 1: Collect all job listings from paginated pages
  const allListings: JobListing[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? `${BASE_URL}/jobs` : `${BASE_URL}/jobs/page/${page}`;
    const html = await fetchPage(url);
    const listings = parseListingPage(html);

    if (listings.length === 0) break;
    allListings.push(...listings);

    if (!hasNextPage(html, page)) break;
  }

  // Phase 2: Filter to candidates that might have NL locations
  // - Primary location is NL → definitely fetch
  // - Has "+More Locations" → might have NL, need to check detail
  const candidates = allListings.filter(
    (job) => isNlLocation(job.primaryLocation) || job.hasMoreLocations,
  );

  // Phase 3: Fetch detail pages and parse JSON-LD
  const limit = pLimit(3);
  const jobs: FetchedJob[] = [];

  await Promise.all(
    candidates.map((listing) =>
      limit(async () => {
        const detailUrl = `${BASE_URL}${listing.href}`;
        let html: string;
        try {
          html = await fetchPage(detailUrl);
        } catch {
          return; // skip failed fetches
        }

        const jsonLd = parseJobDetailJsonLd(html);
        if (!jsonLd) return;

        // Only keep jobs with NL locations
        if (!hasNlJobLocation(jsonLd)) return;

        const descriptionHtml = jsonLd.description ?? "";

        jobs.push({
          externalId: listing.reqId || String(listing.href.match(/R\d+/)?.[0] ?? listing.href),
          title: jsonLd.title || listing.title,
          location: buildLocation(jsonLd),
          descriptionHtml: descriptionHtml || undefined,
          descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
          url: detailUrl,
          salaryRange: buildSalaryRange(jsonLd),
          postedAt: jsonLd.datePosted ? new Date(jsonLd.datePosted) : undefined,
        });
      }),
    ),
  );

  return jobs;
}
