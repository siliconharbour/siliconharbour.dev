/**
 * Ashby Job Importer
 * Extracts job data from Ashby's embedded __appData JSON
 * 
 * Jobs listing: https://jobs.ashbyhq.com/{org_slug}
 * Job details: https://jobs.ashbyhq.com/{org_slug}/{job_id}
 */

import type { JobImporter, ImportSourceConfig, FetchedJob, ValidationResult, WorkplaceType } from "./types";
import { htmlToText } from "./text.server";

const ASHBY_BASE = "https://jobs.ashbyhq.com";

interface AshbyJobPosting {
  id: string;
  title: string;
  updatedAt: string;
  departmentName: string;
  locationName: string;
  workplaceType: string;
  employmentType: string;
  publishedDate: string;
  teamName: string;
}

interface AshbyAppData {
  organization: {
    name: string;
    publicWebsite: string;
    hostedJobsPageSlug: string;
  };
  jobBoard: {
    teams: Array<{ id: string; name: string }>;
    jobPostings: AshbyJobPosting[];
  };
}

interface AshbyJobDetailAppData {
  posting?: {
    id: string;
    title: string;
    descriptionHtml?: string;
    descriptionPlain?: string;
    locationName: string;
    departmentName: string;
    workplaceType: string;
    employmentType: string;
  };
}

/**
 * Extract __appData JSON from Ashby HTML page
 */
function extractAppData<T>(html: string): T {
  const match = html.match(/window\.__appData\s*=\s*({[\s\S]*?});/);
  if (!match) {
    throw new Error("Could not find __appData in page. The page structure may have changed.");
  }
  
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error("Failed to parse __appData JSON. The data format may have changed.");
  }
}

/**
 * Convert Ashby workplace type to our format
 */
function convertWorkplaceType(ashbyType: string): WorkplaceType | undefined {
  const type = ashbyType?.toLowerCase() || "";
  if (type === "remote" || type.includes("remote")) return "remote";
  if (type === "hybrid" || type.includes("hybrid")) return "hybrid";
  if (type === "onsite" || type === "on-site" || type.includes("office")) return "onsite";
  return undefined;
}

/**
 * Fetch the job listing page to get all jobs
 */
async function fetchAshbyListingPage(orgSlug: string): Promise<AshbyAppData> {
  const url = `${ASHBY_BASE}/${orgSlug}`;
  
  const response = await fetch(url, {
    headers: {
      "Accept": "text/html",
      "User-Agent": "siliconharbour.dev job importer",
    },
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Organization "${orgSlug}" not found. Check the org slug is correct.`);
    }
    throw new Error(`Ashby page error: ${response.status} ${response.statusText}`);
  }
  
  const html = await response.text();
  return extractAppData<AshbyAppData>(html);
}

/**
 * Fetch a single job's detail page
 */
async function fetchAshbyJobDetail(orgSlug: string, jobId: string): Promise<AshbyJobDetailAppData> {
  const url = `${ASHBY_BASE}/${orgSlug}/${jobId}`;
  
  const response = await fetch(url, {
    headers: {
      "Accept": "text/html",
      "User-Agent": "siliconharbour.dev job importer",
    },
  });
  
  if (!response.ok) {
    throw new Error(`Ashby job page error: ${response.status} ${response.statusText}`);
  }
  
  const html = await response.text();
  return extractAppData<AshbyJobDetailAppData>(html);
}

/**
 * Convert Ashby job listing to our FetchedJob format (without description)
 */
function convertListingJob(job: AshbyJobPosting, orgSlug: string): FetchedJob {
  return {
    externalId: job.id,
    title: job.title,
    location: job.locationName || undefined,
    department: job.departmentName || job.teamName || undefined,
    url: `${ASHBY_BASE}/${orgSlug}/${job.id}`,
    workplaceType: convertWorkplaceType(job.workplaceType),
    postedAt: job.publishedDate ? new Date(job.publishedDate) : undefined,
    updatedAt: job.updatedAt ? new Date(job.updatedAt) : undefined,
  };
}

export const ashbyImporter: JobImporter = {
  sourceType: "ashby",
  
  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const data = await fetchAshbyListingPage(config.sourceIdentifier);
    const jobs: FetchedJob[] = [];
    
    for (const posting of data.jobBoard.jobPostings) {
      const job = convertListingJob(posting, config.sourceIdentifier);
      
      // Fetch full description for each job
      // This is slower but gives us complete data
      try {
        const details = await fetchAshbyJobDetail(config.sourceIdentifier, posting.id);
        if (details.posting?.descriptionHtml) {
          job.descriptionHtml = details.posting.descriptionHtml;
          job.descriptionText = htmlToText(details.posting.descriptionHtml);
        }
      } catch (e) {
        // Continue without description if detail fetch fails
        console.warn(`Failed to fetch details for job ${posting.id}:`, e);
      }
      
      jobs.push(job);
    }
    
    return jobs;
  },
  
  async fetchJobDetails(jobId: string, config: ImportSourceConfig): Promise<FetchedJob | null> {
    try {
      const details = await fetchAshbyJobDetail(config.sourceIdentifier, jobId);
      if (!details.posting) return null;
      
      const posting = details.posting;
      return {
        externalId: posting.id,
        title: posting.title,
        location: posting.locationName || undefined,
        department: posting.departmentName || undefined,
        descriptionHtml: posting.descriptionHtml,
        descriptionText: posting.descriptionHtml ? htmlToText(posting.descriptionHtml) : undefined,
        url: `${ASHBY_BASE}/${config.sourceIdentifier}/${posting.id}`,
        workplaceType: convertWorkplaceType(posting.workplaceType),
      };
    } catch {
      return null;
    }
  },
  
  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
      return { valid: false, error: "Organization slug is required" };
    }
    
    try {
      const data = await fetchAshbyListingPage(config.sourceIdentifier);
      return { 
        valid: true, 
        jobCount: data.jobBoard.jobPostings.length,
      };
    } catch (e) {
      return { 
        valid: false, 
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
