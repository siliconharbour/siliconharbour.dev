/**
 * Carnegie Learning Canada custom scraper
 *
 * Uses Paycom ATS portal API:
 *   1. Fetch career page HTML to extract session JWT from embedded config
 *   2. POST to search endpoint for job previews
 *   3. GET each job detail for full description HTML
 *
 * Portal URL format:
 *   https://www.paycomonline.net/v4/ats/web.php/portal/{clientKey}/career-page
 *
 * API base: https://portal-applicant-tracking.us-cent.paycomonline.net
 */

import type { FetchedJob, WorkplaceType } from "../types";
import { htmlToText } from "./utils";
import pLimit from "p-limit";

const CLIENT_KEY = "9B60CD2D19720F7445BDFDD8C71C98A2";
const PORTAL_URL = `https://www.paycomonline.net/v4/ats/web.php/portal/${CLIENT_KEY}/career-page`;
const API_BASE = "https://portal-applicant-tracking.us-cent.paycomonline.net";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SiliconHarbour/1.0; +https://siliconharbour.dev)";

// -- Types -------------------------------------------------------------------

interface JobPreview {
  jobId: number;
  jobTitle: string;
  positionType: string;
  remoteType: string;
  locations: string;
  description: string;
  postedOn: string;
  isHotJob: boolean;
}

interface SearchResponse {
  jobPostingPreviews: JobPreview[];
  jobPostingPreviewsCount: number;
}

interface JobDetail {
  jobPosting: {
    jobId: number;
    jobTitle: string;
    location: string;
    city: string;
    remoteType: string;
    salaryRange: string;
    positionType: string;
    jobCategory: string;
    description: string;
    travelPercentage: string;
    educationLevel: string;
  };
}

// -- Helpers -----------------------------------------------------------------

/**
 * Fetch the career page HTML and extract the sessionJWT from the embedded config.
 */
async function getSessionJwt(): Promise<string> {
  const res = await fetch(PORTAL_URL, {
    headers: {
      Accept: "text/html",
      "User-Agent": USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`Paycom portal fetch error: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  // JWT is embedded as: "sessionJWT":"<token>"
  const match = html.match(/"sessionJWT":"([^"]+)"/);
  if (!match?.[1]) {
    throw new Error("Could not extract sessionJWT from Paycom portal page");
  }

  return match[1];
}

/**
 * Search for all job postings via the Paycom API.
 */
async function searchJobs(jwt: string): Promise<JobPreview[]> {
  const url = `${API_BASE}/api/ats/job-posting-previews/search`;

  const body = {
    skip: 0,
    take: 100,
    filtersForQuery: {
      distanceFrom: 0,
      workEnvironments: [],
      positionTypes: [],
      educationLevels: [],
      categories: [],
      travelTypes: [],
      shiftTypes: [],
      otherFilters: [],
      keywordSearchText: "",
      location: "",
      sortOption: "",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      authorization: jwt,
      locale: "en-US",
      "portal-host-referrer": PORTAL_URL,
      origin: "https://www.paycomonline.net",
      referer: "https://www.paycomonline.net/",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Paycom search API error: ${res.status} ${res.statusText}`);
  }

  const data: SearchResponse = await res.json();
  return data.jobPostingPreviews ?? [];
}

/**
 * Fetch full job detail by ID.
 */
async function fetchJobDetail(jwt: string, jobId: number): Promise<JobDetail | null> {
  const url = `${API_BASE}/api/ats/job-postings/${jobId}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      authorization: jwt,
      locale: "en-US",
      "portal-host-referrer": PORTAL_URL,
      origin: "https://www.paycomonline.net",
      referer: "https://www.paycomonline.net/",
    },
  });

  if (!res.ok) return null;
  return res.json() as Promise<JobDetail>;
}

function detectWorkplaceType(remoteType: string): WorkplaceType | undefined {
  const lower = remoteType.toLowerCase();
  if (lower.includes("remote") && !lower.includes("optional")) return "remote";
  if (lower.includes("optional") || lower.includes("hybrid")) return "hybrid";
  if (lower.includes("on-site") || lower.includes("onsite") || lower.includes("in office"))
    return "onsite";
  return undefined;
}

// -- Scraper -----------------------------------------------------------------

export async function scrapeCarnegie(): Promise<FetchedJob[]> {
  const jwt = await getSessionJwt();
  const previews = await searchJobs(jwt);

  if (previews.length === 0) return [];

  const limit = pLimit(3);
  const jobs: FetchedJob[] = [];

  await Promise.all(
    previews.map((preview) =>
      limit(async () => {
        const detail = await fetchJobDetail(jwt, preview.jobId);
        const posting = detail?.jobPosting;

        const descriptionHtml = posting?.description ?? "";
        const location = posting?.location || preview.locations || undefined;
        const workplaceType = detectWorkplaceType(
          posting?.remoteType || preview.remoteType || "",
        );

        const jobUrl = `https://www.paycomonline.net/v4/ats/web.php/portal/${CLIENT_KEY}/jobs/${preview.jobId}`;

        jobs.push({
          externalId: String(preview.jobId),
          title: preview.jobTitle,
          location,
          department: posting?.jobCategory || undefined,
          descriptionHtml: descriptionHtml || undefined,
          descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
          url: jobUrl,
          workplaceType,
          salaryRange: posting?.salaryRange || undefined,
        });
      }),
    ),
  );

  return jobs;
}
