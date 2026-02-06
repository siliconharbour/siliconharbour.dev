// =============================================================================
// Job Importer Types - Shared types for job import modules
// This file is client-safe (no server imports)
// =============================================================================

/**
 * Supported ATS (Applicant Tracking System) source types
 */
export const jobSourceTypes = ["greenhouse", "ashby", "workday", "bamboohr", "lever", "collage", "custom"] as const;
export type JobSourceType = (typeof jobSourceTypes)[number];

/**
 * Job status lifecycle
 * - active: Currently visible on company's career page
 * - removed: Disappeared from feed (may be filled or pulled)
 * - filled: Manually marked as filled
 * - expired: Job had an expiration date that passed
 */
export const importedJobStatuses = ["active", "removed", "filled", "expired", "hidden"] as const;
export type ImportedJobStatus = (typeof importedJobStatuses)[number];

/**
 * Fetch status for import sources
 */
export const fetchStatuses = ["pending", "success", "error"] as const;
export type FetchStatus = (typeof fetchStatuses)[number];

/**
 * Workplace type for jobs
 */
export const workplaceTypes = ["remote", "onsite", "hybrid"] as const;
export type WorkplaceType = (typeof workplaceTypes)[number];

/**
 * Configuration for an import source
 */
export interface ImportSourceConfig {
  id: number;
  companyId: number;
  sourceType: JobSourceType;
  sourceIdentifier: string; // board token, org slug, etc.
  sourceUrl?: string | null;
}

/**
 * A job fetched from an external ATS
 */
export interface FetchedJob {
  externalId: string;
  title: string;
  location?: string;
  department?: string;
  descriptionHtml?: string;
  descriptionText?: string;
  url: string;
  workplaceType?: WorkplaceType;
  postedAt?: Date;
  updatedAt?: Date;
}

/**
 * Result of validating an import source configuration
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  jobCount?: number; // Number of jobs found (if valid)
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  error?: string;
  added: number;
  updated: number;
  removed: number;
  reactivated: number;
  totalActive: number;
}

/**
 * Interface that all job importer modules must implement
 */
export interface JobImporter {
  /** The source type this importer handles */
  readonly sourceType: JobSourceType;

  /**
   * Fetch all jobs from the source
   * @param config - The import source configuration
   * @returns Array of fetched jobs
   */
  fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]>;

  /**
   * Fetch details for a single job (optional, for sources that need separate detail fetches)
   * @param jobId - External job ID
   * @param config - The import source configuration
   * @returns Job details
   */
  fetchJobDetails?(jobId: string, config: ImportSourceConfig): Promise<FetchedJob | null>;

  /**
   * Validate that the configuration is correct and the source is accessible
   * @param config - The import source configuration (partial, without id)
   * @returns Validation result
   */
  validateConfig(
    config: Omit<ImportSourceConfig, "id">,
  ): Promise<ValidationResult>;
}

/**
 * Display labels for source types
 */
export const sourceTypeLabels: Record<JobSourceType, string> = {
  greenhouse: "Greenhouse",
  ashby: "Ashby",
  workday: "Workday",
  bamboohr: "BambooHR",
  lever: "Lever",
  collage: "Collage",
  custom: "Custom",
};

/**
 * Placeholder hints for source identifiers by type
 */
export const sourceIdentifierPlaceholders: Record<JobSourceType, string> = {
  greenhouse: "e.g., colabsoftware (from job-boards.greenhouse.io/colabsoftware)",
  ashby: "e.g., spellbook.legal (from jobs.ashbyhq.com/spellbook.legal)",
  workday: "e.g., nasdaq:Global_External_Site:verafin (company:site:searchText)",
  bamboohr: "e.g., trophiai (from trophiai.bamboohr.com)",
  lever: "e.g., getmysa (from jobs.lever.co/getmysa)",
  collage: "e.g., heyorca (from secure.collage.co/jobs/heyorca)",
  custom: "Custom identifier or URL",
};
