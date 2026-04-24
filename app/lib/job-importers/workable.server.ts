/**
 * Workable Job Importer
 * Fetches jobs from Workable's public widget API
 *
 * Workable URLs follow the pattern:
 *   https://apply.workable.com/{slug}
 *
 * Public API:
 *   List jobs: GET https://apply.workable.com/api/v1/widget/accounts/{slug}
 *   Job detail: GET https://apply.workable.com/api/v2/accounts/{slug}/jobs/{shortcode}
 *
 * The sourceIdentifier is the company slug (e.g., "upstream" from apply.workable.com/upstream/)
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

// -- API response interfaces --

interface WorkableLocation {
  location: string;
  city?: string;
  state?: string;
  country?: string;
}

interface WorkableListJob {
  title: string;
  shortcode: string;
  employment_type?: string;
  telecommuting?: boolean;
  department?: string;
  url?: string;
  shortlink?: string;
  application_url?: string;
  published_on?: string;
  created_at?: string;
  country?: string;
  city?: string;
  state?: string;
  locations?: WorkableLocation[];
  education?: string;
  experience?: string;
  function?: string;
  industry?: string;
}

interface WorkableListResponse {
  jobs: WorkableListJob[];
}

interface WorkableJobDetail {
  title: string;
  description?: string;
  requirements?: string;
  benefits?: string;
  workplace?: string; // "remote", "on_site", "hybrid"
  remote?: boolean;
}

// -- Helper functions --

/**
 * Convert Workable workplace field to our WorkplaceType
 */
function convertWorkplaceType(
  workplace: string | undefined,
  telecommuting: boolean | undefined,
): WorkplaceType | undefined {
  if (workplace) {
    const wp = workplace.toLowerCase();
    if (wp === "remote") return "remote";
    if (wp === "on_site" || wp === "on-site") return "onsite";
    if (wp === "hybrid") return "hybrid";
  }
  // Fallback: telecommuting boolean from list endpoint
  if (telecommuting === true) return "remote";
  return undefined;
}

/**
 * Format location from Workable job fields
 */
function formatLocation(job: WorkableListJob): string | undefined {
  // If multiple locations exist, join them
  if (job.locations && job.locations.length > 1) {
    return job.locations
      .map((loc) => loc.location || [loc.city, loc.state, loc.country].filter(Boolean).join(", "))
      .filter(Boolean)
      .join("; ");
  }

  // Single location from top-level fields
  const parts = [job.city, job.state, job.country].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");

  // Single location from locations array
  if (job.locations && job.locations.length === 1) {
    const loc = job.locations[0];
    return loc.location || [loc.city, loc.state, loc.country].filter(Boolean).join(", ") || undefined;
  }

  return undefined;
}

/**
 * Build description HTML from detail sections
 */
function buildDescriptionHtml(detail: WorkableJobDetail): string {
  const parts: string[] = [];

  if (detail.description) {
    parts.push(detail.description);
  }
  if (detail.requirements) {
    parts.push(`<h3>Requirements</h3>${detail.requirements}`);
  }
  if (detail.benefits) {
    parts.push(`<h3>Benefits</h3>${detail.benefits}`);
  }

  return parts.join("\n");
}

/**
 * Fetch all jobs from Workable's widget API
 */
async function fetchWorkableJobs(slug: string): Promise<WorkableListJob[]> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "siliconharbour.dev job importer",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Workable account "${slug}" not found. Check the company slug.`);
    }
    throw new Error(`Workable API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as WorkableListResponse;

  if (!data.jobs || !Array.isArray(data.jobs)) {
    throw new Error("Unexpected response format from Workable API");
  }

  return data.jobs;
}

/**
 * Fetch detail for a single job from Workable's v2 API
 */
async function fetchWorkableJobDetail(
  slug: string,
  shortcode: string,
): Promise<WorkableJobDetail | null> {
  const url = `https://apply.workable.com/api/v2/accounts/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(shortcode)}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "siliconharbour.dev job importer",
    },
  });

  if (!response.ok) return null;

  return (await response.json()) as WorkableJobDetail;
}

/**
 * Convert a Workable list job (with optional detail) to our FetchedJob format
 */
function convertJob(
  job: WorkableListJob,
  slug: string,
  detail?: WorkableJobDetail | null,
): FetchedJob {
  const jobUrl = `https://apply.workable.com/${encodeURIComponent(slug)}/j/${job.shortcode}`;

  let descriptionHtml: string | undefined;
  let workplaceType: WorkplaceType | undefined;

  if (detail) {
    const html = buildDescriptionHtml(detail);
    descriptionHtml = html || undefined;
    workplaceType = convertWorkplaceType(detail.workplace, job.telecommuting);
  } else {
    workplaceType = convertWorkplaceType(undefined, job.telecommuting);
  }

  return {
    externalId: job.shortcode,
    title: job.title,
    location: formatLocation(job),
    department: job.department || undefined,
    descriptionHtml,
    descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
    url: jobUrl,
    workplaceType,
    postedAt: job.published_on ? new Date(job.published_on) : undefined,
  };
}

export const workableImporter: JobImporter = {
  sourceType: "workable",

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const slug = config.sourceIdentifier;
    const jobs = await fetchWorkableJobs(slug);

    // Fetch details for each job with bounded concurrency
    const limit = pLimit(5);
    const results = await Promise.all(
      jobs.map((job) =>
        limit(async () => {
          const detail = await fetchWorkableJobDetail(slug, job.shortcode);
          return convertJob(job, slug, detail);
        }),
      ),
    );

    return results;
  },

  async fetchJobDetails(jobId: string, config: ImportSourceConfig): Promise<FetchedJob | null> {
    const slug = config.sourceIdentifier;

    try {
      // Fetch the list to get the basic job info
      const jobs = await fetchWorkableJobs(slug);
      const job = jobs.find((j) => j.shortcode === jobId);
      if (!job) return null;

      const detail = await fetchWorkableJobDetail(slug, jobId);
      return convertJob(job, slug, detail);
    } catch {
      return null;
    }
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
      return {
        valid: false,
        error:
          "Company slug is required (e.g., 'upstream' from apply.workable.com/upstream)",
      };
    }

    try {
      const jobs = await fetchWorkableJobs(config.sourceIdentifier);
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
