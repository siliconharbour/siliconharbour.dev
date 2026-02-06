/**
 * Greenhouse Job Importer
 * Fetches jobs from Greenhouse's public API
 * 
 * API endpoint: https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs
 * No authentication required for public job boards
 */

import type { JobImporter, ImportSourceConfig, FetchedJob, ValidationResult } from "./types";

const API_BASE = "https://boards-api.greenhouse.io/v1/boards";

interface GreenhouseJob {
  id: number;
  internal_job_id: number;
  title: string;
  updated_at: string;
  requisition_id: string | null;
  location: {
    name: string;
  };
  absolute_url: string;
  content?: string;
  departments?: Array<{
    id: number;
    name: string;
  }>;
  offices?: Array<{
    id: number;
    name: string;
    location: string;
  }>;
  metadata?: Array<{
    id: number;
    name: string;
    value: string | string[] | null;
    value_type: string;
  }>;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
  meta: {
    total: number;
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
 * Detect workplace type from job location or metadata
 */
function detectWorkplaceType(job: GreenhouseJob): "remote" | "onsite" | "hybrid" | undefined {
  const location = job.location?.name?.toLowerCase() || "";
  
  // Check for remote keywords
  if (location.includes("remote")) {
    if (location.includes("hybrid")) {
      return "hybrid";
    }
    return "remote";
  }
  
  // Check metadata for remote work info
  if (job.metadata) {
    for (const meta of job.metadata) {
      const value = typeof meta.value === "string" ? meta.value.toLowerCase() : "";
      if (meta.name.toLowerCase().includes("remote") || value.includes("remote")) {
        if (value.includes("hybrid")) return "hybrid";
        return "remote";
      }
    }
  }
  
  // Default to onsite if we have a physical location
  if (location && !location.includes("anywhere")) {
    return "onsite";
  }
  
  return undefined;
}

/**
 * Convert Greenhouse job to our FetchedJob format
 */
function convertJob(job: GreenhouseJob, _boardToken: string): FetchedJob {
  return {
    externalId: String(job.id),
    title: job.title,
    location: job.location?.name || undefined,
    department: job.departments?.map(d => d.name).join(", ") || undefined,
    descriptionHtml: job.content || undefined,
    descriptionText: job.content ? htmlToText(job.content) : undefined,
    url: job.absolute_url,
    workplaceType: detectWorkplaceType(job),
    updatedAt: job.updated_at ? new Date(job.updated_at) : undefined,
  };
}

/**
 * Fetch all jobs from a Greenhouse board
 */
async function fetchGreenhouseJobs(boardToken: string, includeContent: boolean = true): Promise<GreenhouseResponse> {
  const url = `${API_BASE}/${boardToken}/jobs${includeContent ? "?content=true" : ""}`;
  
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "siliconharbour.dev job importer",
    },
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Board "${boardToken}" not found. Check the board token is correct.`);
    }
    throw new Error(`Greenhouse API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

export const greenhouseImporter: JobImporter = {
  sourceType: "greenhouse",
  
  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const data = await fetchGreenhouseJobs(config.sourceIdentifier);
    return data.jobs.map(job => convertJob(job, config.sourceIdentifier));
  },
  
  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
      return { valid: false, error: "Board token is required" };
    }
    
    try {
      // Fetch without content for faster validation
      const data = await fetchGreenhouseJobs(config.sourceIdentifier, false);
      return { 
        valid: true, 
        jobCount: data.meta.total,
      };
    } catch (e) {
      return { 
        valid: false, 
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
