/**
 * iCIMS Job Importer
 *
 * Fetches jobs from iCIMS career portals via HTML scraping.
 *
 * iCIMS URLs follow the pattern:
 *   https://{subdomain}.icims.com/jobs/search?in_iframe=1   (listing page)
 *   https://{subdomain}.icims.com/jobs/{jobId}/{slug}/job   (detail page)
 *
 * The sourceIdentifier is the subdomain prefix, e.g., "uscareers-repairify"
 * from uscareers-repairify.icims.com.
 *
 * Two-step approach:
 * 1. Fetch listing page HTML, extract job URLs from anchor tags
 * 2. For each job URL, fetch detail page and parse JSON-LD JobPosting schema
 */

import type {
  JobImporter,
  ImportSourceConfig,
  FetchedJob,
  ValidationResult,
  WorkplaceType,
} from "./types";
import { htmlToText } from "./text.server";
import pLimit from "p-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Regex to find iCIMS job detail links in listing HTML */
const ICIMS_JOB_LINK_RE = /\/jobs\/(\d+)\/[^"'\s<>]+\/job/gi;

/**
 * Fetch HTML from a URL with a standard browser-like User-Agent.
 */
async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "siliconharbour.dev job importer",
    },
  });

  if (!response.ok) {
    throw new Error(`iCIMS fetch error: ${response.status} ${response.statusText} for ${url}`);
  }

  return response.text();
}

/**
 * Extract all JSON-LD script blocks from HTML.
 */
function getScriptJsonBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (match[1]) blocks.push(match[1]);
  }
  return blocks;
}

/**
 * Build the base URL for an iCIMS portal from the sourceIdentifier.
 */
function baseUrl(sourceIdentifier: string): string {
  return `https://${sourceIdentifier}.icims.com`;
}

/**
 * Build the listing page URL.
 */
function listingUrl(sourceIdentifier: string): string {
  return `${baseUrl(sourceIdentifier)}/jobs/search?in_iframe=1`;
}

/**
 * Parse job detail URLs from the listing page HTML.
 * Returns deduplicated absolute URLs.
 */
function parseJobUrlsFromListing(html: string, sourceIdentifier: string): string[] {
  const base = baseUrl(sourceIdentifier);
  const seen = new Set<string>();
  const urls: string[] = [];

  let match: RegExpExecArray | null;
  // Reset lastIndex before exec loop
  ICIMS_JOB_LINK_RE.lastIndex = 0;
  while ((match = ICIMS_JOB_LINK_RE.exec(html)) !== null) {
    const path = match[0];
    let absolute = path.startsWith("http") ? path : `${base}${path}`;
    // Ensure in_iframe=1 is present — JSON-LD is only on the iframe version
    if (!absolute.includes("in_iframe=1")) {
      absolute += absolute.includes("?") ? "&in_iframe=1" : "?in_iframe=1";
    }
    if (!seen.has(absolute)) {
      seen.add(absolute);
      urls.push(absolute);
    }
  }

  return urls;
}

/**
 * Extract the numeric job ID from an iCIMS job URL.
 */
function jobIdFromUrl(url: string): string {
  const m = url.match(/\/jobs\/(\d+)\//);
  return m?.[1] ?? "";
}

// ---------------------------------------------------------------------------
// Location & workplace type
// ---------------------------------------------------------------------------

function parseLocation(jobPosting: Record<string, unknown>): string | undefined {
  const location = jobPosting.jobLocation;
  const entries = Array.isArray(location) ? location : location ? [location] : [];

  const formatted = entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const addr = (entry as { address?: Record<string, unknown> }).address;
      if (!addr || typeof addr !== "object") return "";
      const city = String(addr.addressLocality || "").trim();
      const region = String(addr.addressRegion || "").trim();
      const country = String(addr.addressCountry || "").trim();
      return [city, region, country].filter(Boolean).join(", ");
    })
    .filter(Boolean);

  return formatted.length > 0 ? formatted.join("; ") : undefined;
}

function detectWorkplaceType(
  location: string | undefined,
  jobPosting: Record<string, unknown>,
): WorkplaceType | undefined {
  // Check explicit jobLocationType first (some iCIMS portals include it)
  const locationType = String(jobPosting.jobLocationType || "").toLowerCase();
  if (locationType.includes("telecommute") || locationType.includes("remote")) return "remote";

  // Fall back to location text heuristics
  if (!location) return undefined;
  const loc = location.toLowerCase();
  if (loc.includes("remote")) return "remote";
  if (loc.includes("hybrid")) return "hybrid";
  return undefined;
}

// ---------------------------------------------------------------------------
// JSON-LD parsing
// ---------------------------------------------------------------------------

interface ParsedIcimsPosting {
  externalId: string;
  title: string;
  descriptionHtml?: string;
  location?: string;
  department?: string;
  url: string;
  postedAt?: Date;
  workplaceType?: WorkplaceType;
}

function parseJobPostingFromHtml(html: string, fallbackUrl: string): ParsedIcimsPosting {
  const blocks = getScriptJsonBlocks(html);

  for (const raw of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const item = candidate as Record<string, unknown>;
      if (item["@type"] !== "JobPosting") continue;

      const title = String(item.title || "").trim();
      if (!title) continue;

      const url = String(item.url || fallbackUrl);
      const externalId = jobIdFromUrl(url) || jobIdFromUrl(fallbackUrl);
      if (!externalId) {
        throw new Error("Could not determine iCIMS job id from URL");
      }

      const descriptionHtml = String(item.description || "").trim() || undefined;
      const location = parseLocation(item);
      const workplaceType = detectWorkplaceType(location, item);

      // occupationalCategory often carries a department-like value in iCIMS
      const department = item.occupationalCategory
        ? String(item.occupationalCategory).trim()
        : undefined;

      const postedAt = item.datePosted ? new Date(String(item.datePosted)) : undefined;

      return {
        externalId,
        title,
        descriptionHtml,
        location: location || undefined,
        department: department || undefined,
        url,
        postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
        workplaceType,
      };
    }
  }

  throw new Error("Could not find JobPosting JSON-LD schema on iCIMS detail page");
}

// ---------------------------------------------------------------------------
// Convert to FetchedJob
// ---------------------------------------------------------------------------

function convertPosting(posting: ParsedIcimsPosting): FetchedJob {
  return {
    externalId: posting.externalId,
    title: posting.title,
    location: posting.location,
    department: posting.department,
    descriptionHtml: posting.descriptionHtml,
    descriptionText: posting.descriptionHtml ? htmlToText(posting.descriptionHtml) : undefined,
    url: posting.url,
    workplaceType: posting.workplaceType,
    postedAt: posting.postedAt,
  };
}

// ---------------------------------------------------------------------------
// Importer
// ---------------------------------------------------------------------------

export const icimsImporter: JobImporter = {
  sourceType: "icims",
  meta: {
    name: "iCIMS",
    approach:
      "Two-step: scrapes listing HTML for job URLs, then extracts JSON-LD JobPosting from detail pages.",
    style: "HTML listing scrape + JSON-LD detail",
    reliability: "medium-high",
    quirks: "JSON-LD only present on ?in_iframe=1 version of pages.",
  },

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const identifier = config.sourceIdentifier.trim();

    // Step 1: Fetch listing page and extract job URLs
    const html = await fetchHtml(listingUrl(identifier));
    const jobUrls = parseJobUrlsFromListing(html, identifier);

    if (jobUrls.length === 0) {
      return [];
    }

    // Step 2: Fetch each detail page with bounded concurrency
    const limit = pLimit(5);
    const jobs = await Promise.all(
      jobUrls.map((url) =>
        limit(async () => {
          const detailHtml = await fetchHtml(url);
          const posting = parseJobPostingFromHtml(detailHtml, url);
          return convertPosting(posting);
        }),
      ),
    );

    return jobs;
  },

  async fetchJobDetails(jobId: string, config: ImportSourceConfig): Promise<FetchedJob | null> {
    const identifier = config.sourceIdentifier.trim();

    try {
      // We need the slug to build the full URL — try a generic one
      const url = `${baseUrl(identifier)}/jobs/${jobId}/job`;
      const html = await fetchHtml(url);
      const posting = parseJobPostingFromHtml(html, url);
      return convertPosting(posting);
    } catch {
      return null;
    }
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
      return {
        valid: false,
        error:
          "iCIMS subdomain is required (e.g., 'uscareers-repairify' from uscareers-repairify.icims.com)",
      };
    }

    try {
      const jobs = await this.fetchJobs(config as ImportSourceConfig);
      return {
        valid: true,
        jobCount: jobs.length,
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
