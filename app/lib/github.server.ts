/**
 * GitHub API service for importing people from GitHub.
 * Uses Octokit with throttling and retry plugins for robust API access.
 * 
 * Authentication fallback order:
 * 1. GITHUB_TOKEN environment variable
 * 2. `gh` CLI (if installed and authenticated)
 * 3. Anonymous (limited to 60 requests/hour)
 */

import { Octokit } from "octokit";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";
import { execSync } from "child_process";

// Re-export types from the shared types file
export type {
  GitHubUserBasic,
  GitHubUser,
  GitHubSocialAccount,
  GitHubUserWithSocials,
  RateLimitInfo,
} from "./github.types";

import type {
  GitHubUserBasic,
  GitHubUser,
  GitHubSocialAccount,
  GitHubUserWithSocials,
  RateLimitInfo,
} from "./github.types";

// Create Octokit with throttling and retry plugins
const ThrottledOctokit = Octokit.plugin(throttling, retry);

let cachedOctokit: InstanceType<typeof ThrottledOctokit> | null = null;
let tokenSource: string | null = null;

/**
 * Get GitHub token using fallback order:
 * 1. GITHUB_TOKEN env var
 * 2. gh CLI
 * 3. null (anonymous)
 */
function getGitHubToken(): string | null {
  // Try env var first
  if (process.env.GITHUB_TOKEN) {
    tokenSource = "GITHUB_TOKEN environment variable";
    return process.env.GITHUB_TOKEN;
  }
  
  // Try gh CLI
  try {
    const token = execSync("gh auth token", { 
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    if (token) {
      tokenSource = "gh CLI authentication";
      return token;
    }
  } catch {
    // gh not installed or not authenticated
  }
  
  // Anonymous
  tokenSource = "anonymous access (rate limited to 60/hour)";
  return null;
}

/**
 * Get or create an Octokit instance with throttling
 */
function getOctokit(): InstanceType<typeof ThrottledOctokit> {
  if (cachedOctokit) {
    return cachedOctokit;
  }
  
  const token = getGitHubToken();
  console.log(`GitHub: Using ${tokenSource}`);
  
  cachedOctokit = new ThrottledOctokit({
    auth: token ?? undefined,
    userAgent: "siliconharbour.dev/1.0",
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(`Rate limit hit for ${options.method} ${options.url}`);
        // Retry up to 2 times after waiting
        if (retryCount < 2) {
          octokit.log.info(`Retrying after ${retryAfter} seconds`);
          return true;
        }
        return false;
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`Secondary rate limit for ${options.method} ${options.url}`);
        // Don't retry secondary rate limits (abuse detection)
        return false;
      },
    },
    retry: {
      doNotRetry: ["429"], // Don't retry rate limits (handled by throttling)
      retries: 3,
    },
  });
  
  return cachedOctokit;
}

/**
 * Custom error class for rate limiting
 */
export class GitHubRateLimitError extends Error {
  resetTime: Date;
  remaining: number;
  
  constructor(resetTime: Date, remaining: number = 0) {
    super(`GitHub API rate limited. Resets at ${resetTime.toLocaleTimeString()}`);
    this.name = "GitHubRateLimitError";
    this.resetTime = resetTime;
    this.remaining = remaining;
  }
}

/**
 * Search for GitHub users by location.
 * Returns basic user info - use getUserProfile for full details.
 */
export async function searchUsersByLocation(
  location: string,
  page: number = 1,
  perPage: number = 30
): Promise<{ users: GitHubUserBasic[]; total: number; rateLimit: RateLimitInfo }> {
  const octokit = getOctokit();
  
  const response = await octokit.rest.search.users({
    q: `location:${location} type:user`,
    page,
    per_page: perPage,
  });
  
  const rateLimit: RateLimitInfo = {
    remaining: parseInt(response.headers["x-ratelimit-remaining"] ?? "0"),
    limit: parseInt(response.headers["x-ratelimit-limit"] ?? "0"),
    reset: new Date(parseInt(response.headers["x-ratelimit-reset"] ?? "0") * 1000),
  };
  
  return {
    users: response.data.items.map(item => ({
      login: item.login,
      id: item.id,
      avatar_url: item.avatar_url,
      html_url: item.html_url,
    })),
    total: response.data.total_count,
    rateLimit,
  };
}

/**
 * Get full user profile details
 */
export async function getUserProfile(username: string): Promise<GitHubUser> {
  const octokit = getOctokit();
  
  const response = await octokit.rest.users.getByUsername({ username });
  
  return {
    login: response.data.login,
    id: response.data.id,
    avatar_url: response.data.avatar_url,
    html_url: response.data.html_url,
    name: response.data.name ?? null,
    company: response.data.company ?? null,
    bio: response.data.bio ?? null,
    blog: response.data.blog ?? null,
    location: response.data.location ?? null,
    public_repos: response.data.public_repos,
    twitter_username: response.data.twitter_username ?? null,
  };
}

/**
 * Batch fetch user profiles with progress callback.
 * Uses throttling to respect rate limits.
 */
export async function getUserProfiles(
  usernames: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<GitHubUser[]> {
  const profiles: GitHubUser[] = [];
  
  for (let i = 0; i < usernames.length; i++) {
    try {
      const profile = await getUserProfile(usernames[i]);
      profiles.push(profile);
    } catch (e) {
      console.error(`Failed to fetch profile for ${usernames[i]}:`, e);
      // Continue with next user
    }
    onProgress?.(i + 1, usernames.length);
  }
  
  return profiles;
}

/**
 * Location search terms for Newfoundland & Labrador.
 * These cover the various ways people write their location on GitHub.
 * Note: GitHub search is case-insensitive and does partial matching.
 * 
 * Known location variations found on GitHub profiles:
 *   St. John's, NL (18)
 *   Newfoundland, Canada (13)
 *   St. John's, Newfoundland (8)
 *   St. John's, Newfoundland, Canada (5)
 *   St. John's, NL, Canada (5)
 *   NL, Canada (5)
 *   St. John's Newfoundland (4)
 *   Newfoundland (4)
 *   St. John's (4)
 *   St. John's, Newfoundland and Labrador (3)
 *   Newfoundland and Labrador (2)
 *   St. John's NL (2)
 *   Newfoundland & Labrador (1)
 *   Newfoundland Time Zone (1)
 *   newfoundland (1)
 *   Newfoundland and Labrador, Canada (1)
 *   St.John's, NL, Canada (1)
 *   St. John's, Newfoundland & Labrador (1)
 *   St. John's, Canada (1)
 *   St. John's, Newfoundland & Labrador, Canada (1)
 *   St. John's NL, Canada (1)
 *   St. Johns, NL (1)
 *   St.John's NL (1)
 *   St.John's, Newfoundland, Canada (1)
 *   st john's,NL (1)
 *   St John's Newfoundland and Labrador (1)
 *   GFW, Newfoundland & Labrador, Canada (1)
 *   st. john's, nl (1)
 *   st. john's, nl, canada (1)
 *   Newfoundland Canada (1)
 *   Clarenville, NL (1)
 *   St. john's, Newfoundland & Labrador (1)
 *   Upper Island Cove, Newfoundland Canada (1)
 */
const NEWFOUNDLAND_LOCATION_TERMS = [
  // Primary - catches most variations like "Newfoundland, Canada", "St. John's, Newfoundland", etc.
  "Newfoundland",
  // NL abbreviation - catches "St. John's, NL", "NL, Canada", etc.
  '"NL"',  // Quoted to avoid matching "NL" as part of other words
  // Labrador specifically
  "Labrador",
];

// Cache for combined search results to avoid re-fetching on pagination
let cachedNewfoundlandUsers: GitHubUserBasic[] | null = null;
let cachedNewfoundlandUsersTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch ALL Newfoundland users by running separate searches for each location term.
 * Results are deduplicated by user ID and cached for pagination.
 * This uses more API calls but produces more accurate results than OR queries.
 */
async function fetchAllNewfoundlandUsers(): Promise<{ 
  users: GitHubUserBasic[]; 
  rateLimit: RateLimitInfo 
}> {
  // Check cache first
  if (cachedNewfoundlandUsers && (Date.now() - cachedNewfoundlandUsersTimestamp) < CACHE_TTL_MS) {
    const rateLimit = await getRateLimitStatus();
    return { users: cachedNewfoundlandUsers, rateLimit };
  }
  
  const octokit = getOctokit();
  const seenIds = new Set<number>();
  const allUsers: GitHubUserBasic[] = [];
  let latestRateLimit: RateLimitInfo = {
    remaining: 0,
    limit: 0,
    reset: new Date(),
  };
  
  // Search each location term separately
  for (const term of NEWFOUNDLAND_LOCATION_TERMS) {
    console.log(`GitHub: Searching for users with location "${term}"...`);
    
    // Paginate through all results for this term
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const response = await octokit.rest.search.users({
        q: `location:${term} type:user`,
        page,
        per_page: 100, // Max per page
      });
      
      latestRateLimit = {
        remaining: parseInt(response.headers["x-ratelimit-remaining"] ?? "0"),
        limit: parseInt(response.headers["x-ratelimit-limit"] ?? "0"),
        reset: new Date(parseInt(response.headers["x-ratelimit-reset"] ?? "0") * 1000),
      };
      
      // Add users we haven't seen yet (deduplicate)
      for (const item of response.data.items) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          allUsers.push({
            login: item.login,
            id: item.id,
            avatar_url: item.avatar_url,
            html_url: item.html_url,
          });
        }
      }
      
      // Check if there are more pages
      const totalPages = Math.ceil(response.data.total_count / 100);
      hasMore = page < totalPages && response.data.items.length > 0;
      page++;
      
      // Safety: GitHub search API only returns first 1000 results
      if (page > 10) {
        console.log(`GitHub: Reached 1000 result limit for "${term}"`);
        hasMore = false;
      }
    }
    
    console.log(`GitHub: Found ${seenIds.size} unique users so far (after "${term}")`);
  }
  
  // Cache the results
  cachedNewfoundlandUsers = allUsers;
  cachedNewfoundlandUsersTimestamp = Date.now();
  
  console.log(`GitHub: Total unique Newfoundland users found: ${allUsers.length}`);
  
  return { users: allUsers, rateLimit: latestRateLimit };
}

/**
 * Clear the Newfoundland users cache.
 * Call this when starting a fresh import.
 */
export function clearNewfoundlandUsersCache(): void {
  cachedNewfoundlandUsers = null;
  cachedNewfoundlandUsersTimestamp = 0;
}

/**
 * Search for GitHub users in Newfoundland & Labrador.
 * Runs separate searches for each location term and deduplicates results.
 * Returns paginated results from the combined, deduplicated user list.
 */
export async function searchNewfoundlandUsers(
  page: number = 1,
  perPage: number = 30
): Promise<{ users: GitHubUserBasic[]; total: number; rateLimit: RateLimitInfo }> {
  // Fetch all users (uses cache if available)
  const { users: allUsers, rateLimit } = await fetchAllNewfoundlandUsers();
  
  // Paginate the results
  const startIndex = (page - 1) * perPage;
  const endIndex = startIndex + perPage;
  const paginatedUsers = allUsers.slice(startIndex, endIndex);
  
  return {
    users: paginatedUsers,
    total: allUsers.length,
    rateLimit,
  };
}

/**
 * Download avatar image from GitHub
 */
export async function fetchAvatar(avatarUrl: string): Promise<Buffer | null> {
  try {
    const response = await fetch(avatarUrl, {
      headers: {
        "User-Agent": "siliconharbour.dev/1.0",
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch avatar: ${avatarUrl} - ${response.status}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    console.error(`Error fetching avatar: ${avatarUrl}`, e);
    return null;
  }
}

/**
 * Get current rate limit status
 */
export async function getRateLimitStatus(): Promise<RateLimitInfo> {
  const octokit = getOctokit();
  
  try {
    const response = await octokit.rest.rateLimit.get();
    
    return {
      remaining: response.data.resources.core.remaining,
      limit: response.data.resources.core.limit,
      reset: new Date(response.data.resources.core.reset * 1000),
    };
  } catch {
    return {
      remaining: 0,
      limit: 0,
      reset: new Date(),
    };
  }
}

/**
 * Get user's social accounts
 */
export async function getUserSocialAccounts(username: string): Promise<GitHubSocialAccount[]> {
  const octokit = getOctokit();
  
  try {
    const response = await octokit.rest.users.listSocialAccountsForUser({ username });
    return response.data.map(account => ({
      provider: account.provider,
      url: account.url,
    }));
  } catch {
    // Social accounts endpoint may not exist for all users, return empty
    return [];
  }
}

/**
 * Get user profile with social accounts included.
 * Returns full profile data plus rate limit info.
 */
export async function getUserProfileWithRateLimit(username: string): Promise<{ 
  user: GitHubUserWithSocials; 
  rateLimit: RateLimitInfo 
}> {
  const octokit = getOctokit();
  
  const response = await octokit.rest.users.getByUsername({ username });
  
  const rateLimit: RateLimitInfo = {
    remaining: parseInt(response.headers["x-ratelimit-remaining"] ?? "0"),
    limit: parseInt(response.headers["x-ratelimit-limit"] ?? "0"),
    reset: new Date(parseInt(response.headers["x-ratelimit-reset"] ?? "0") * 1000),
  };
  
  const user: GitHubUser = {
    login: response.data.login,
    id: response.data.id,
    avatar_url: response.data.avatar_url,
    html_url: response.data.html_url,
    name: response.data.name ?? null,
    company: response.data.company ?? null,
    bio: response.data.bio ?? null,
    blog: response.data.blog ?? null,
    location: response.data.location ?? null,
    public_repos: response.data.public_repos,
    twitter_username: response.data.twitter_username ?? null,
  };
  
  // Fetch social accounts (costs 1 more API call but gives us valuable data)
  const socialAccounts = await getUserSocialAccounts(username);
  
  return { 
    user: { ...user, socialAccounts }, 
    rateLimit 
  };
}

/**
 * Get users that a given user is following (basic info only).
 * Uses automatic pagination to get all results efficiently.
 */
export async function getAllUserFollowing(username: string): Promise<{ 
  users: GitHubUserBasic[]; 
  rateLimit: RateLimitInfo 
}> {
  const octokit = getOctokit();
  
  // Use paginate to automatically handle all pages
  const users = await octokit.paginate(
    octokit.rest.users.listFollowingForUser,
    { username, per_page: 100 },
    (response) => response.data.map(user => ({
      login: user.login,
      id: user.id,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
    }))
  );
  
  // Get current rate limit status after pagination completes
  const rateLimit = await getRateLimitStatus();
  
  return { users, rateLimit };
}

/**
 * Get all followers of a given user (basic info only).
 * Uses automatic pagination to get all results efficiently.
 */
export async function getAllUserFollowers(username: string): Promise<{ 
  users: GitHubUserBasic[]; 
  rateLimit: RateLimitInfo 
}> {
  const octokit = getOctokit();
  
  // Use paginate to automatically handle all pages
  const users = await octokit.paginate(
    octokit.rest.users.listFollowersForUser,
    { username, per_page: 100 },
    (response) => response.data.map(user => ({
      login: user.login,
      id: user.id,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
    }))
  );
  
  // Get current rate limit status after pagination completes
  const rateLimit = await getRateLimitStatus();
  
  return { users, rateLimit };
}

/**
 * Fetch full profiles for a list of basic users.
 * This is the expensive operation - each user requires an API call.
 * Uses throttling to respect rate limits automatically.
 * 
 * @param users - List of basic user info (from following/followers/search)
 * @param onProgress - Optional callback for progress updates
 * @returns Full user profiles
 */
export async function fetchFullProfiles(
  users: GitHubUserBasic[],
  onProgress?: (completed: number, total: number, username: string) => void
): Promise<{ profiles: GitHubUser[]; errors: string[] }> {
  const profiles: GitHubUser[] = [];
  const errors: string[] = [];
  
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    try {
      const profile = await getUserProfile(user.login);
      profiles.push(profile);
      onProgress?.(i + 1, users.length, user.login);
    } catch (e) {
      const errorMsg = `${user.login}: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(errorMsg);
      console.error(`Failed to fetch profile for ${user.login}:`, e);
      onProgress?.(i + 1, users.length, user.login);
    }
  }
  
  return { profiles, errors };
}

// Legacy exports for backward compatibility
export async function getUserFollowing(
  username: string,
  page: number = 1,
  perPage: number = 100
): Promise<{ users: GitHubUserBasic[]; rateLimit: RateLimitInfo }> {
  const octokit = getOctokit();
  
  const response = await octokit.rest.users.listFollowingForUser({
    username,
    page,
    per_page: perPage,
  });
  
  const rateLimit: RateLimitInfo = {
    remaining: parseInt(response.headers["x-ratelimit-remaining"] ?? "0"),
    limit: parseInt(response.headers["x-ratelimit-limit"] ?? "0"),
    reset: new Date(parseInt(response.headers["x-ratelimit-reset"] ?? "0") * 1000),
  };
  
  return { 
    users: response.data.map(user => ({
      login: user.login,
      id: user.id,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
    })), 
    rateLimit 
  };
}

export async function getUserFollowers(
  username: string,
  page: number = 1,
  perPage: number = 100
): Promise<{ users: GitHubUserBasic[]; rateLimit: RateLimitInfo }> {
  const octokit = getOctokit();
  
  const response = await octokit.rest.users.listFollowersForUser({
    username,
    page,
    per_page: perPage,
  });
  
  const rateLimit: RateLimitInfo = {
    remaining: parseInt(response.headers["x-ratelimit-remaining"] ?? "0"),
    limit: parseInt(response.headers["x-ratelimit-limit"] ?? "0"),
    reset: new Date(parseInt(response.headers["x-ratelimit-reset"] ?? "0") * 1000),
  };
  
  return { 
    users: response.data.map(user => ({
      login: user.login,
      id: user.id,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
    })), 
    rateLimit 
  };
}
