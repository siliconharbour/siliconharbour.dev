/**
 * Dayforce Job Importer
 *
 * Fetches jobs from Dayforce HCM (formerly Ceridian) career portals.
 *
 * sourceIdentifier format: {clientNamespace}:{jobBoardCode}
 *   e.g. "tml:CANDIDATEPORTALTML"
 *
 * API pattern:
 *   1. GET /api/auth/csrf → CSRF token + session cookies
 *   2. POST /api/geo/{namespace}/jobposting/search → job listings with descriptions
 *
 * Job URLs: https://jobs.dayforcehcm.com/en-US/{namespace}/{boardCode}/jobs/{jobPostingId}
 */

import type {
  JobImporter,
  ImportSourceConfig,
  FetchedJob,
  ValidationResult,
} from "./types";
import { htmlToText } from "./text.server";

const BASE_URL = "https://jobs.dayforcehcm.com";
const PAGE_SIZE = 100;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

// -- Types -------------------------------------------------------------------

interface DayforceLocation {
  formattedAddress: string;
  cityName: string;
  stateCode: string;
  isoCountryCode: string;
}

interface DayforceJobPosting {
  jobPostingId: number;
  jobReqId: number;
  jobTitle: string;
  jobDescription: string;
  postingStartTimestampUTC: string | null;
  postingExpiryTimestampUTC: string | null;
  hasVirtualLocation: boolean;
  postingLocations: DayforceLocation[];
}

interface DayforceSearchResponse {
  jobPostings: DayforceJobPosting[];
  maxCount: number;
  offset: number;
  count: number;
}

// -- Helpers -----------------------------------------------------------------

function parseIdentifier(sourceIdentifier: string): {
  namespace: string;
  boardCode: string;
} {
  const colonIdx = sourceIdentifier.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(
      `Invalid Dayforce sourceIdentifier: "${sourceIdentifier}". ` +
        "Expected format: namespace:boardCode (e.g. tml:CANDIDATEPORTALTML)",
    );
  }
  return {
    namespace: sourceIdentifier.slice(0, colonIdx),
    boardCode: sourceIdentifier.slice(colonIdx + 1),
  };
}

/**
 * Get a CSRF token and session cookies from the Dayforce auth endpoint.
 * Returns the token and a cookie header string for subsequent requests.
 */
async function getSession(): Promise<{ csrfToken: string; cookies: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/csrf`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`Dayforce CSRF fetch error: ${res.status} ${res.statusText}`);
  }

  const data: { csrfToken: string } = await res.json();

  // Extract Set-Cookie headers for the session
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookieStr = setCookies
    .map((c) => c.split(";")[0])
    .join("; ");

  return { csrfToken: data.csrfToken, cookies: cookieStr };
}

/**
 * Fetch all job postings for a Dayforce career site with pagination.
 */
async function fetchAllJobs(
  namespace: string,
  boardCode: string,
  csrfToken: string,
  cookies: string,
): Promise<DayforceJobPosting[]> {
  const allJobs: DayforceJobPosting[] = [];
  let offset = 0;

  for (let page = 0; page < 20; page++) {
    const url = `${BASE_URL}/api/geo/${namespace}/jobposting/search`;

    const body = {
      clientNamespace: namespace,
      jobBoardCode: boardCode,
      cultureCode: "en-US",
      distanceUnit: 0,
      paginationStart: offset,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "x-csrf-token": csrfToken,
        Cookie: cookies,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Dayforce search API error: ${res.status} ${res.statusText}`);
    }

    const data: DayforceSearchResponse = await res.json();
    allJobs.push(...data.jobPostings);

    if (allJobs.length >= data.maxCount || data.jobPostings.length < PAGE_SIZE) {
      break;
    }

    offset += data.jobPostings.length;
  }

  return allJobs;
}

function buildLocation(posting: DayforceJobPosting): string | undefined {
  if (posting.postingLocations.length === 0) {
    return posting.hasVirtualLocation ? "Remote" : undefined;
  }
  return posting.postingLocations
    .map((loc) => loc.formattedAddress || `${loc.cityName}, ${loc.stateCode}, ${loc.isoCountryCode}`)
    .join("; ");
}

function buildJobUrl(namespace: string, boardCode: string, jobPostingId: number): string {
  return `${BASE_URL}/en-US/${namespace}/${boardCode}/jobs/${jobPostingId}`;
}

// -- Importer ----------------------------------------------------------------

export const dayforceImporter: JobImporter = {
  sourceType: "dayforce",
  meta: {
    name: "Dayforce",
    approach:
      "Dayforce HCM (formerly Ceridian) career portal REST API. " +
      "CSRF token from auth endpoint, then POST search for all listings with full descriptions.",
    style: "Clean JSON API with session-based auth",
    reliability: "high",
    quirks:
      "Requires CSRF token + cookies from /api/auth/csrf before search requests. " +
      "sourceIdentifier format: namespace:boardCode (e.g. tml:CANDIDATEPORTALTML). " +
      "Cloudflare-protected, needs browser-like User-Agent.",
  },

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const { namespace, boardCode } = parseIdentifier(config.sourceIdentifier);
    const { csrfToken, cookies } = await getSession();
    const postings = await fetchAllJobs(namespace, boardCode, csrfToken, cookies);

    if (postings.length === 0) return [];

    return postings.map((posting) => {
      const descriptionHtml = posting.jobDescription ?? "";

      return {
        externalId: String(posting.jobPostingId),
        title: posting.jobTitle,
        location: buildLocation(posting),
        descriptionHtml: descriptionHtml || undefined,
        descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
        url: buildJobUrl(namespace, boardCode, posting.jobPostingId),
        workplaceType: posting.hasVirtualLocation ? "remote" : undefined,
        postedAt: posting.postingStartTimestampUTC
          ? new Date(posting.postingStartTimestampUTC)
          : undefined,
      };
    });
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
      return {
        valid: false,
        error:
          "Dayforce sourceIdentifier required. Format: namespace:boardCode " +
          "(e.g. tml:CANDIDATEPORTALTML)",
      };
    }

    try {
      const { namespace, boardCode } = parseIdentifier(config.sourceIdentifier);
      const { csrfToken, cookies } = await getSession();
      const postings = await fetchAllJobs(namespace, boardCode, csrfToken, cookies);
      return {
        valid: true,
        jobCount: postings.length,
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
