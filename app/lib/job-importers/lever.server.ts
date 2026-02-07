/**
 * Lever Job Importer
 * Fetches jobs from Lever's public postings API
 *
 * Lever URLs follow the pattern:
 *   https://jobs.lever.co/{company}
 *
 * Public API:
 *   https://api.lever.co/v0/postings/{company}
 *
 * The sourceIdentifier is the company slug (e.g., "getmysa", "milk-moovement")
 */

import type {
  JobImporter,
  ImportSourceConfig,
  FetchedJob,
  ValidationResult,
  WorkplaceType,
} from "./types";
import { htmlToText } from "./text.server";

interface LeverCategories {
  commitment?: string; // e.g., "Full-time", "Part-time", "Internship"
  department?: string;
  location?: string;
  team?: string;
  allLocations?: string[];
}

interface LeverPosting {
  id: string;
  text: string; // Job title
  categories: LeverCategories;
  descriptionPlain?: string;
  description?: string; // HTML
  additional?: string; // Additional HTML content
  additionalPlain?: string;
  lists?: Array<{ text: string; content: string }>; // Structured sections (requirements, etc.)
  hostedUrl: string;
  applyUrl: string;
  createdAt: number; // Unix timestamp in milliseconds
  updatedAt?: number;
  workplaceType?: string; // "unspecified", "on-site", "remote", "hybrid"
}

/**
 * Convert Lever workplace type to our WorkplaceType
 */
function convertWorkplaceType(
  leverType: string | undefined
): WorkplaceType | undefined {
  if (!leverType || leverType === "unspecified") return undefined;
  if (leverType === "remote") return "remote";
  if (leverType === "on-site") return "onsite";
  if (leverType === "hybrid") return "hybrid";
  return undefined;
}

/**
 * Detect workplace type from location string as fallback
 */
function detectWorkplaceTypeFromLocation(
  location: string | undefined
): WorkplaceType | undefined {
  if (!location) return undefined;
  const loc = location.toLowerCase();
  if (loc.includes("remote")) return "remote";
  if (loc.includes("hybrid")) return "hybrid";
  return undefined;
}

/**
 * Build the full description HTML from all Lever posting sections
 */
function buildDescriptionHtml(posting: LeverPosting): string {
  const parts: string[] = [];

  if (posting.description) {
    parts.push(posting.description);
  }

  if (posting.lists && posting.lists.length > 0) {
    for (const list of posting.lists) {
      parts.push(`<h3>${list.text}</h3>`);
      parts.push(list.content);
    }
  }

  if (posting.additional) {
    parts.push(posting.additional);
  }

  return parts.join("\n");
}

/**
 * Format location from Lever categories
 */
function formatLocation(categories: LeverCategories): string | undefined {
  if (categories.allLocations && categories.allLocations.length > 0) {
    return categories.allLocations.join("; ");
  }
  return categories.location || undefined;
}

/**
 * Fetch all postings from Lever's public API
 */
async function fetchLeverPostings(company: string): Promise<LeverPosting[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Lever company "${company}" not found. Check the company slug.`
      );
    }
    throw new Error(
      `Lever API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // Lever returns [] for valid companies with no postings
  // and { ok: false, error: "..." } for invalid companies
  if (!Array.isArray(data)) {
    if (data.ok === false) {
      throw new Error(data.error || "Invalid Lever company");
    }
    throw new Error("Unexpected response format from Lever API");
  }

  return data;
}

/**
 * Convert a Lever posting to our FetchedJob format
 */
function convertPosting(posting: LeverPosting): FetchedJob {
  const descriptionHtml = buildDescriptionHtml(posting);

  const workplaceType =
    convertWorkplaceType(posting.workplaceType) ||
    detectWorkplaceTypeFromLocation(posting.categories.location);

  return {
    externalId: posting.id,
    title: posting.text,
    location: formatLocation(posting.categories),
    department:
      posting.categories.department || posting.categories.team || undefined,
    descriptionHtml: descriptionHtml || undefined,
    descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
    url: posting.hostedUrl,
    workplaceType,
    postedAt: posting.createdAt ? new Date(posting.createdAt) : undefined,
  };
}

export const leverImporter: JobImporter = {
  sourceType: "lever",

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const company = config.sourceIdentifier;
    const postings = await fetchLeverPostings(company);
    return postings.map(convertPosting);
  },

  async fetchJobDetails(
    jobId: string,
    config: ImportSourceConfig
  ): Promise<FetchedJob | null> {
    const company = config.sourceIdentifier;

    try {
      // Lever's API can fetch individual postings
      const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}/${jobId}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) return null;

      const posting = (await response.json()) as LeverPosting;
      return convertPosting(posting);
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
        error:
          "Company slug is required (e.g., 'getmysa' from jobs.lever.co/getmysa)",
      };
    }

    try {
      const postings = await fetchLeverPostings(config.sourceIdentifier);
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
