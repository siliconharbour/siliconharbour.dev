/**
 * Workday Job Importer
 * Fetches jobs from Workday's public career site API
 *
 * Workday URLs follow the pattern:
 *   https://{company}.wd{instance}.myworkdayjobs.com/{site}
 *
 * For example:
 *   https://nasdaq.wd1.myworkdayjobs.com/Global_External_Site?q=verafin
 *
 * The sourceIdentifier format is: {company}:{site}:{searchText}
 * Example: "nasdaq:Global_External_Site:verafin"
 */

import type {
  JobImporter,
  ImportSourceConfig,
  FetchedJob,
  ValidationResult,
  WorkplaceType,
} from "./types";

// Workday's Cloudflare protection blocks Node's default User-Agent.
// We need to use a browser-like User-Agent to avoid 400 errors.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Parse the source identifier into components
 * Format: {company}:{site}:{searchText}
 * The searchText is optional
 */
function parseSourceIdentifier(identifier: string): {
  company: string;
  site: string;
  searchText: string;
} {
  const parts = identifier.split(":");
  if (parts.length < 2) {
    throw new Error(
      'Invalid source identifier format. Expected "company:site" or "company:site:searchText"'
    );
  }
  return {
    company: parts[0],
    site: parts[1],
    searchText: parts.slice(2).join(":") || "", // Allow colons in search text
  };
}

/**
 * Build the Workday API base URL
 * Note: Most companies use wd1, but some may use wd5 or other instances.
 * We default to wd1 as it's most common.
 */
function buildBaseUrl(company: string): string {
  return `https://${company}.wd1.myworkdayjobs.com`;
}

interface WorkdayJobListing {
  title: string;
  externalPath: string;
  locationsText: string;
  postedOn: string;
  bulletFields: string[];
}

interface WorkdayJobsResponse {
  total: number;
  jobPostings: WorkdayJobListing[];
}

interface WorkdayJobDetail {
  jobPostingInfo: {
    id: string;
    title: string;
    jobDescription: string;
    location: string;
    additionalLocations?: string[];
    postedOn: string;
    startDate: string;
    endDate?: string;
    timeType: string;
    jobReqId: string;
    jobPostingId: string;
    externalUrl: string;
  };
  hiringOrganization?: {
    name: string;
  };
}

/**
 * Strip HTML tags and decode entities to get plain text
 */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse "Posted X Days Ago" into a Date
 */
function parsePostedOn(postedOn: string): Date | undefined {
  if (!postedOn) return undefined;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lower = postedOn.toLowerCase();

  if (lower.includes("today")) {
    return today;
  }

  if (lower.includes("yesterday")) {
    const date = new Date(today);
    date.setDate(date.getDate() - 1);
    return date;
  }

  // Match "Posted X Days Ago" or "Posted 30+ Days Ago"
  const daysMatch = lower.match(/(\d+)\+?\s*days?\s*ago/i);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return date;
  }

  return undefined;
}

/**
 * Detect workplace type from job location or time type
 */
function detectWorkplaceType(location: string, _timeType: string): WorkplaceType | undefined {
  const loc = location?.toLowerCase() || "";

  if (loc.includes("remote")) {
    if (loc.includes("hybrid")) return "hybrid";
    return "remote";
  }

  if (loc.includes("hybrid")) return "hybrid";

  // Default to onsite if we have a physical location
  if (location && !loc.includes("anywhere")) {
    return "onsite";
  }

  return undefined;
}

/**
 * Fetch all jobs from a Workday career site
 */
async function fetchWorkdayJobs(
  company: string,
  site: string,
  searchText: string
): Promise<WorkdayJobsResponse> {
  const baseUrl = buildBaseUrl(company);
  const url = `${baseUrl}/wday/cxs/${company}/${site}/jobs`;

  // Workday uses POST with a JSON body
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": BROWSER_USER_AGENT,
    },
    body: JSON.stringify({
      appliedFacets: {},
      limit: 100, // Fetch up to 100 jobs at a time
      offset: 0,
      searchText: searchText,
    }),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Career site "${company}/${site}" not found. Check the company and site identifiers.`);
    }
    throw new Error(`Workday API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as WorkdayJobsResponse;

  // If there are more jobs than the initial fetch, paginate
  if (data.total > data.jobPostings.length) {
    const allJobs = [...data.jobPostings];
    let offset = data.jobPostings.length;

    while (offset < data.total) {
      const pageResponse = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": BROWSER_USER_AGENT,
        },
        body: JSON.stringify({
          appliedFacets: {},
          limit: 100,
          offset: offset,
          searchText: searchText,
        }),
      });

      if (!pageResponse.ok) break;

      const pageData = (await pageResponse.json()) as WorkdayJobsResponse;
      allJobs.push(...pageData.jobPostings);
      offset += pageData.jobPostings.length;

      // Safety check to prevent infinite loops
      if (pageData.jobPostings.length === 0) break;
    }

    return { total: data.total, jobPostings: allJobs };
  }

  return data;
}

/**
 * Fetch details for a single job
 */
async function fetchWorkdayJobDetail(
  company: string,
  site: string,
  externalPath: string
): Promise<WorkdayJobDetail> {
  const baseUrl = buildBaseUrl(company);
  // externalPath already includes the leading slash and full path
  const url = `${baseUrl}/wday/cxs/${company}/${site}${externalPath}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": BROWSER_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Workday job detail error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Convert Workday job listing to our FetchedJob format (without full description)
 */
function convertListingJob(
  job: WorkdayJobListing,
  company: string,
  site: string
): FetchedJob {
  const baseUrl = buildBaseUrl(company);
  // Extract job ID from externalPath (e.g., /job/Canada---St-Johns/Title_R0025228 -> R0025228)
  const jobIdMatch = job.externalPath.match(/_([A-Z0-9-]+(?:-\d+)?)$/);
  const externalId = jobIdMatch ? jobIdMatch[1] : job.externalPath;

  return {
    externalId: externalId,
    title: job.title,
    location: job.locationsText || undefined,
    url: `${baseUrl}/${site}${job.externalPath}`,
    postedAt: parsePostedOn(job.postedOn),
    workplaceType: detectWorkplaceType(job.locationsText, ""),
  };
}

/**
 * Convert full job detail to FetchedJob format
 */
function convertDetailJob(
  detail: WorkdayJobDetail,
  company: string,
  site: string
): FetchedJob {
  const info = detail.jobPostingInfo;
  const baseUrl = buildBaseUrl(company);

  // Combine location with additional locations
  let location = info.location;
  if (info.additionalLocations && info.additionalLocations.length > 0) {
    location = [info.location, ...info.additionalLocations].join("; ");
  }

  return {
    externalId: info.jobReqId || info.id,
    title: info.title,
    location: location || undefined,
    descriptionHtml: info.jobDescription || undefined,
    descriptionText: info.jobDescription ? htmlToText(info.jobDescription) : undefined,
    url: info.externalUrl || `${baseUrl}/${site}/job/${info.jobPostingId}`,
    workplaceType: detectWorkplaceType(info.location || "", info.timeType || ""),
    postedAt: info.startDate ? new Date(info.startDate) : undefined,
  };
}

export const workdayImporter: JobImporter = {
  sourceType: "workday",

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const { company, site, searchText } = parseSourceIdentifier(config.sourceIdentifier);
    const data = await fetchWorkdayJobs(company, site, searchText);
    const jobs: FetchedJob[] = [];

    for (const posting of data.jobPostings) {
      // Start with basic info from listing
      const job = convertListingJob(posting, company, site);

      // Fetch full description for each job
      try {
        const details = await fetchWorkdayJobDetail(company, site, posting.externalPath);
        const fullJob = convertDetailJob(details, company, site);
        // Merge listing data with detail data (detail has more info)
        jobs.push({
          ...job,
          ...fullJob,
          // Keep listing's postedAt if detail doesn't have a better one
          postedAt: fullJob.postedAt || job.postedAt,
        });
      } catch (e) {
        // Continue without full description if detail fetch fails
        console.warn(`Failed to fetch details for job ${job.externalId}:`, e);
        jobs.push(job);
      }
    }

    return jobs;
  },

  async fetchJobDetails(
    jobId: string,
    config: ImportSourceConfig
  ): Promise<FetchedJob | null> {
    const { company, site } = parseSourceIdentifier(config.sourceIdentifier);

    try {
      // jobId here should be the externalPath
      const details = await fetchWorkdayJobDetail(company, site, jobId);
      return convertDetailJob(details, company, site);
    } catch {
      return null;
    }
  },

  async validateConfig(
    config: Omit<ImportSourceConfig, "id">
  ): Promise<ValidationResult> {
    if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
      return {
        valid: false,
        error: 'Source identifier is required (format: "company:site" or "company:site:searchText")',
      };
    }

    try {
      const { company, site, searchText } = parseSourceIdentifier(config.sourceIdentifier);
      const data = await fetchWorkdayJobs(company, site, searchText);
      return {
        valid: true,
        jobCount: data.total,
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
