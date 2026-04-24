/**
 * Jibe Job Importer
 * Fetches jobs from Jibe-powered career sites via their public JSON API
 *
 * Jibe uses custom domains per company, e.g.:
 *   https://jobs.symphonyai.com
 *
 * Public API:
 *   GET https://{domain}/api/jobs?limit=100&page={n}
 *
 * The sourceIdentifier is the full domain (e.g., "jobs.symphonyai.com")
 */

import type {
  JobImporter,
  ImportSourceConfig,
  FetchedJob,
  ValidationResult,
  WorkplaceType,
} from "./types";
import { htmlToText } from "./text.server";

// -- Jibe API response types ------------------------------------------------

interface JibeCategory {
  name: string;
}

interface JibeJob {
  slug: string;
  title: string;
  employment_type?: string;
  posted_date?: string;
  description?: string;
  responsibilities?: string;
  qualifications?: string;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  location_name?: string;
  categories?: JibeCategory[];
  tags1?: string[];
  department?: string;
  apply_url?: string;
  hiring_organization?: string;
  client_code?: string;
  meta_data?: {
    canonical_url?: string;
  };
}

interface JibeApiJobWrapper {
  data: JibeJob;
}

interface JibeApiResponse {
  totalCount: number;
  jobs?: JibeApiJobWrapper[];
  requisitions?: JibeApiJobWrapper[];
}

// -- Helpers ----------------------------------------------------------------

/**
 * Normalize the sourceIdentifier to a bare domain (no protocol, no trailing slash)
 */
function normalizeDomain(raw: string): string {
  let domain = raw.trim();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/\/+$/, "");
  return domain;
}

/**
 * Build the full description HTML from Jibe's separate content fields
 */
function buildDescriptionHtml(job: JibeJob): string {
  const parts: string[] = [];

  if (job.description) {
    parts.push(job.description);
  }

  if (job.responsibilities) {
    parts.push("<h3>Responsibilities</h3>");
    parts.push(job.responsibilities);
  }

  if (job.qualifications) {
    parts.push("<h3>Qualifications</h3>");
    parts.push(job.qualifications);
  }

  return parts.join("\n");
}

/**
 * Format location from Jibe job fields
 */
function formatLocation(job: JibeJob): string | undefined {
  const segments: string[] = [];
  if (job.city) segments.push(job.city);
  if (job.state) segments.push(job.state);
  if (job.country) segments.push(job.country);

  if (segments.length > 0) return segments.join(", ");

  // Fallback to location_name
  if (job.location_name) return job.location_name;

  return undefined;
}

/**
 * Detect workplace type from employment_type and location text
 */
function detectWorkplaceType(job: JibeJob): WorkplaceType | undefined {
  const empType = (job.employment_type ?? "").toLowerCase();
  if (empType.includes("remote")) return "remote";
  if (empType.includes("hybrid")) return "hybrid";

  const locText = [job.location_name, job.city, job.state, job.country].filter(Boolean).join(" ").toLowerCase();
  if (locText.includes("remote")) return "remote";
  if (locText.includes("hybrid")) return "hybrid";

  return undefined;
}

/**
 * Build the canonical URL for a job
 */
function buildJobUrl(domain: string, job: JibeJob): string {
  if (job.apply_url) return job.apply_url;
  return `https://${domain}/jobs/${job.slug}`;
}

// -- API fetch --------------------------------------------------------------

const PAGE_SIZE = 100;

/**
 * Fetch all jobs from a Jibe careers site, paginating through the API
 */
async function fetchAllJibeJobs(domain: string): Promise<JibeJob[]> {
  const allJobs: JibeJob[] = [];
  let page = 1;
  let totalCount = 0;

  do {
    const url = `https://${domain}/api/jobs?limit=${PAGE_SIZE}&page=${page}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; SiliconHarbour/1.0; +https://siliconharbour.dev)",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Jibe careers site not found at ${domain}. Check the domain.`);
      }
      throw new Error(`Jibe API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as JibeApiResponse;
    totalCount = data.totalCount ?? 0;

    // The API may return jobs under "jobs" or "requisitions" depending on config
    // Each entry wraps the actual job data in a "data" property
    const wrappers = data.jobs ?? data.requisitions ?? [];
    allJobs.push(...wrappers.map((w) => w.data));

    page++;
  } while (allJobs.length < totalCount);

  return allJobs;
}

// -- Importer ---------------------------------------------------------------

/**
 * Convert a Jibe job to our FetchedJob format
 */
function convertJob(domain: string, job: JibeJob): FetchedJob {
  const descriptionHtml = buildDescriptionHtml(job);
  const department =
    job.department || (job.categories && job.categories.length > 0 ? job.categories[0].name : undefined);

  return {
    externalId: job.slug,
    title: job.title,
    location: formatLocation(job),
    department,
    descriptionHtml: descriptionHtml || undefined,
    descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
    url: buildJobUrl(domain, job),
    workplaceType: detectWorkplaceType(job),
    postedAt: job.posted_date ? new Date(job.posted_date) : undefined,
  };
}

export const jibeImporter: JobImporter = {
  sourceType: "jibe",
  meta: {
    name: "Jibe",
    approach:
      "Calls Jibe JSON API (/api/jobs?limit=100&page=N). Returns full descriptions in one call, paginated.",
    style: "Clean API integration, single-step fetch",
    reliability: "high",
    quirks:
      "Each customer has their own domain. API wraps jobs in a { data: {...} } envelope.",
  },

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const domain = normalizeDomain(config.sourceIdentifier);
    const jobs = await fetchAllJibeJobs(domain);
    return jobs.map((job) => convertJob(domain, job));
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
      return {
        valid: false,
        error:
          "Jibe careers domain is required (e.g., 'jobs.symphonyai.com')",
      };
    }

    try {
      const domain = normalizeDomain(config.sourceIdentifier);
      const jobs = await fetchAllJibeJobs(domain);
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
