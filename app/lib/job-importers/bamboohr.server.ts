/**
 * BambooHR Job Importer
 * Fetches jobs from BambooHR's public careers API
 *
 * BambooHR URLs follow the pattern:
 *   https://{company}.bamboohr.com/careers
 *
 * For example:
 *   https://trophiai.bamboohr.com/careers
 *
 * The sourceIdentifier is just the company subdomain (e.g., "trophiai")
 */

import type {
  JobImporter,
  ImportSourceConfig,
  FetchedJob,
  ValidationResult,
  WorkplaceType,
} from "./types";
import { htmlToText } from "./text.server";

/**
 * Build the BambooHR API base URL
 */
function buildBaseUrl(company: string): string {
  return `https://${company}.bamboohr.com`;
}

interface BambooHRJobListing {
  id: string;
  jobOpeningName: string;
  departmentId: string | null;
  departmentLabel: string | null;
  employmentStatusLabel: string | null;
  location: {
    city: string | null;
    state: string | null;
  };
  isRemote: boolean | null;
  locationType: string; // "0" = onsite, "1" = remote, "2" = hybrid
}

interface BambooHRJobsResponse {
  meta: {
    totalCount: number;
  };
  result: BambooHRJobListing[];
}

interface BambooHRJobDetail {
  meta: Record<string, unknown>;
  result: {
    jobOpening: {
      jobOpeningShareUrl: string;
      jobOpeningName: string;
      jobOpeningStatus: string;
      departmentId: string | null;
      departmentLabel: string | null;
      employmentStatusLabel: string | null;
      location: {
        city: string | null;
        state: string | null;
        postalCode: string | null;
        addressCountry: string | null;
      };
      description: string;
      isRemote: boolean | null;
      locationType: string;
    };
  };
}

/**
 * Convert BambooHR location type to our WorkplaceType
 */
function convertLocationType(
  locationType: string,
  isRemote: boolean | null
): WorkplaceType | undefined {
  // locationType: "0" = onsite, "1" = remote, "2" = hybrid
  if (locationType === "1" || isRemote === true) return "remote";
  if (locationType === "2") return "hybrid";
  if (locationType === "0") return "onsite";
  return undefined;
}

/**
 * Format location string from city and state
 */
function formatLocation(city: string | null, state: string | null): string | undefined {
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  return undefined;
}

/**
 * Fetch all jobs from a BambooHR career site
 */
async function fetchBambooHRJobs(company: string): Promise<BambooHRJobsResponse> {
  const baseUrl = buildBaseUrl(company);
  const url = `${baseUrl}/careers/list`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Career site "${company}" not found. Check the company subdomain is correct.`);
    }
    throw new Error(`BambooHR API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch details for a single job
 */
async function fetchBambooHRJobDetail(
  company: string,
  jobId: string
): Promise<BambooHRJobDetail> {
  const baseUrl = buildBaseUrl(company);
  const url = `${baseUrl}/careers/${jobId}/detail`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`BambooHR job detail error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Convert BambooHR job listing to our FetchedJob format (without full description)
 */
function convertListingJob(job: BambooHRJobListing, company: string): FetchedJob {
  const baseUrl = buildBaseUrl(company);

  return {
    externalId: job.id,
    title: job.jobOpeningName,
    location: formatLocation(job.location.city, job.location.state),
    department: job.departmentLabel || undefined,
    url: `${baseUrl}/careers/${job.id}`,
    workplaceType: convertLocationType(job.locationType, job.isRemote),
  };
}

/**
 * Convert full job detail to FetchedJob format
 */
function convertDetailJob(detail: BambooHRJobDetail, company: string): FetchedJob {
  const job = detail.result.jobOpening;
  const baseUrl = buildBaseUrl(company);

  return {
    externalId: job.jobOpeningShareUrl.split("/").pop() || "",
    title: job.jobOpeningName,
    location: formatLocation(job.location.city, job.location.state),
    department: job.departmentLabel || undefined,
    descriptionHtml: job.description || undefined,
    descriptionText: job.description ? htmlToText(job.description) : undefined,
    url: job.jobOpeningShareUrl || `${baseUrl}/careers`,
    workplaceType: convertLocationType(job.locationType, job.isRemote),
  };
}

export const bamboohrImporter: JobImporter = {
  sourceType: "bamboohr",

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const company = config.sourceIdentifier;
    const data = await fetchBambooHRJobs(company);
    const jobs: FetchedJob[] = [];

    for (const listing of data.result) {
      // Start with basic info from listing
      const job = convertListingJob(listing, company);

      // Fetch full description for each job
      try {
        const details = await fetchBambooHRJobDetail(company, listing.id);
        const fullJob = convertDetailJob(details, company);
        // Merge listing data with detail data
        jobs.push({
          ...job,
          ...fullJob,
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
    const company = config.sourceIdentifier;

    try {
      const details = await fetchBambooHRJobDetail(company, jobId);
      return convertDetailJob(details, company);
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
        error: "Company subdomain is required (e.g., 'trophiai' from trophiai.bamboohr.com)",
      };
    }

    try {
      const data = await fetchBambooHRJobs(config.sourceIdentifier);
      return {
        valid: true,
        jobCount: data.meta.totalCount,
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
