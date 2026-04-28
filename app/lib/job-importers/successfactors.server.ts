/**
 * SuccessFactors Job Importer
 *
 * Scrapes SAP SuccessFactors career sites for job listings.
 *
 * sourceIdentifier format: {host}:{location}
 *   e.g. "jobs.hatch.com:St. John's" (with location filter)
 *   e.g. "jobs.hatch.com:" (no location filter)
 *
 * How it works:
 *   1. Fetch search page HTML from https://{host}/search/?q=&location={location}
 *   2. Parse <table class="searchResults"> for job links, locations, departments, dates
 *   3. Fetch each job detail page, extract .job_description HTML
 */

import type {
  JobImporter,
  ImportSourceConfig,
  FetchedJob,
  ValidationResult,
} from "./types";
import { htmlToText } from "./text.server";
import { parseHTML } from "linkedom";
import pLimit from "p-limit";

// -- Request helpers --------------------------------------------------------

const USER_AGENT = "Mozilla/5.0 (compatible; SiliconHarbour/1.0; +https://siliconharbour.dev)";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`SuccessFactors fetch error: ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

// -- Parsing helpers --------------------------------------------------------

/**
 * Parse sourceIdentifier into host and optional location.
 * Format: host:location (location may be empty)
 */
function parseIdentifier(sourceIdentifier: string): {
  host: string;
  location: string;
} {
  const colonIdx = sourceIdentifier.indexOf(":");
  if (colonIdx === -1) {
    // Treat entire string as host with no location filter
    return { host: sourceIdentifier.trim(), location: "" };
  }
  const host = sourceIdentifier.slice(0, colonIdx).trim();
  const location = sourceIdentifier.slice(colonIdx + 1).trim();
  return { host, location };
}

interface SearchResult {
  externalId: string;
  title: string;
  url: string;
  location?: string;
  department?: string;
  dateText?: string;
}

/**
 * Fetch the search page and parse job listing rows from the results table.
 */
async function fetchSearchResults(host: string, location: string): Promise<SearchResult[]> {
  const searchUrl = location
    ? `https://${host}/search/?q=&location=${encodeURIComponent(location)}`
    : `https://${host}/search/?q=`;

  // SuccessFactors paginates with &startrow=N. Fetch pages until we run out.
  const results: SearchResult[] = [];
  let startRow = 0;
  const pageSize = 25; // default page size

  while (true) {
    const url = startRow > 0 ? `${searchUrl}&startrow=${startRow}` : searchUrl;
    const html = await fetchHtml(url);
    const { document } = parseHTML(html);

    const rows = document.querySelectorAll("table.searchResults tr.data-row");
    if (rows.length === 0) break;

    for (const row of rows) {
      const linkEl = row.querySelector("a.jobTitle-link");
      if (!linkEl) continue;

      const href = linkEl.getAttribute("href") ?? "";
      const title = (linkEl.textContent ?? "").trim();
      if (!title || !href) continue;

      // Extract the external ID from the URL path: /job/{slug}/{id}/
      const idMatch = href.match(/\/job\/[^/]+\/(\d+)\/?/);
      const externalId = idMatch ? idMatch[1] : href;

      const fullUrl = href.startsWith("http") ? href : `https://${host}${href}`;

      const locationEl = row.querySelector("span.jobLocation");
      const departmentEl = row.querySelector("span.jobDepartment");
      const dateEl = row.querySelector("span.jobDate");

      results.push({
        externalId,
        title,
        url: fullUrl,
        location: locationEl ? (locationEl.textContent ?? "").trim() || undefined : undefined,
        department: departmentEl ? (departmentEl.textContent ?? "").trim() || undefined : undefined,
        dateText: dateEl ? (dateEl.textContent ?? "").trim() || undefined : undefined,
      });
    }

    // Check if there are more pages
    const nextLink = document.querySelector("a.pagination-link.next, a[title='Next']");
    if (!nextLink || rows.length < pageSize) break;

    startRow += pageSize;
  }

  return results;
}

/**
 * Fetch a job detail page and extract the description HTML.
 */
async function fetchJobDescription(jobUrl: string): Promise<string | null> {
  try {
    const html = await fetchHtml(jobUrl);
    const { document } = parseHTML(html);

    // SuccessFactors puts the description in .job_description or .jobdescription
    const descEl =
      document.querySelector(".job_description") ??
      document.querySelector(".jobdescription") ??
      document.querySelector('[class*="jobDescription"]');

    if (!descEl) return null;
    return (descEl.innerHTML ?? "").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Try to parse a date string like "Apr 25, 2025" or similar formats
 */
function parseDateText(text: string | undefined): Date | undefined {
  if (!text) return undefined;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// -- Importer ---------------------------------------------------------------

export const successfactorsImporter: JobImporter = {
  sourceType: "successfactors",
  meta: {
    name: "SuccessFactors",
    approach:
      "Scrapes SAP SuccessFactors career sites. Search page for listings, detail pages for descriptions.",
    style: "HTML scraping with detail fetch pass",
    reliability: "medium",
    quirks:
      "sourceIdentifier format: host:location. Location filters the search results.",
  },

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const { host, location } = parseIdentifier(config.sourceIdentifier);
    const searchResults = await fetchSearchResults(host, location);
    if (searchResults.length === 0) return [];

    const limit = pLimit(3);
    const jobs: FetchedJob[] = [];

    await Promise.all(
      searchResults.map((result) =>
        limit(async () => {
          const descriptionHtml = await fetchJobDescription(result.url);

          jobs.push({
            externalId: result.externalId,
            title: result.title,
            location: result.location,
            department: result.department,
            descriptionHtml: descriptionHtml || undefined,
            descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
            url: result.url,
            postedAt: parseDateText(result.dateText),
          });
        }),
      ),
    );

    return jobs;
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
      return {
        valid: false,
        error:
          "SuccessFactors sourceIdentifier required. Format: host:location " +
          "(e.g., jobs.hatch.com:St. John's)",
      };
    }

    try {
      const { host, location } = parseIdentifier(config.sourceIdentifier);
      const results = await fetchSearchResults(host, location);
      return {
        valid: true,
        jobCount: results.length,
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
