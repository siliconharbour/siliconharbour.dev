/**
 * GitHub API types - shared between client and server
 */

/**
 * Minimal user info returned by search and list endpoints.
 * These endpoints only return basic profile data.
 */
export interface GitHubUserBasic {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
}

/**
 * Full user profile returned by the users/:username endpoint.
 * Includes all the detailed fields.
 */
export interface GitHubUser extends GitHubUserBasic {
  name: string | null;
  company: string | null;
  bio: string | null;
  blog: string | null;
  location: string | null;
  public_repos: number;
  twitter_username: string | null;
}

export interface GitHubSocialAccount {
  provider: string;
  url: string;
}

export interface GitHubUserWithSocials extends GitHubUser {
  socialAccounts: GitHubSocialAccount[];
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  reset: Date;
}

/**
 * Import job status - matches the DB schema
 */
export type ImportJobStatus = "idle" | "running" | "paused" | "completed" | "error";

/**
 * Import progress state for bulk GitHub import
 * Used by both server (github-import.server.ts) and client (github-by-location.tsx)
 */
export interface ImportProgress {
  status: ImportJobStatus;
  totalItems: number;
  processedItems: number;
  currentPage: number;
  totalPages: number;
  importedCount: number;
  skippedCount: number;
  blockedCount: number;
  errorCount: number;
  rateLimitRemaining: number | null;
  rateLimitReset: Date | null;
  lastError: string | null;
  lastActivity: Date | null;
  canResume: boolean;
  waitingForRateLimit: boolean;
}
