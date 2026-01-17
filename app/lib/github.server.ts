/**
 * GitHub API service for importing people from GitHub.
 * 
 * Authentication fallback order:
 * 1. GITHUB_TOKEN environment variable
 * 2. `gh` CLI (if installed and authenticated)
 * 3. Anonymous (limited to 10 requests/minute for search)
 */

import { execSync } from "child_process";

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
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

export interface GitHubSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubUser[];
}

interface RateLimitInfo {
  remaining: number;
  limit: number;
  reset: Date;
}

let cachedToken: string | null | undefined = undefined;

/**
 * Get GitHub token using fallback order:
 * 1. GITHUB_TOKEN env var
 * 2. gh CLI
 * 3. null (anonymous)
 */
async function getGitHubToken(): Promise<string | null> {
  if (cachedToken !== undefined) {
    return cachedToken;
  }
  
  // Try env var first
  if (process.env.GITHUB_TOKEN) {
    cachedToken = process.env.GITHUB_TOKEN;
    console.log("GitHub: Using GITHUB_TOKEN environment variable");
    return cachedToken;
  }
  
  // Try gh CLI
  try {
    const token = execSync("gh auth token", { 
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    if (token) {
      cachedToken = token;
      console.log("GitHub: Using gh CLI authentication");
      return cachedToken;
    }
  } catch {
    // gh not installed or not authenticated
  }
  
  // Anonymous
  cachedToken = null;
  console.log("GitHub: Using anonymous access (rate limited)");
  return cachedToken;
}

/**
 * Make an authenticated request to the GitHub API
 */
async function githubFetch(url: string): Promise<Response> {
  const token = await getGitHubToken();
  
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "siliconharbour.dev/1.0",
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  return fetch(url, { headers });
}

/**
 * Search for GitHub users by location
 */
export async function searchUsersByLocation(
  location: string,
  page: number = 1,
  perPage: number = 30
): Promise<{ users: GitHubUser[]; total: number; rateLimit: RateLimitInfo }> {
  const query = encodeURIComponent(`location:${location} type:user`);
  const url = `https://api.github.com/search/users?q=${query}&page=${page}&per_page=${perPage}`;
  
  const response = await githubFetch(url);
  
  const rateLimit: RateLimitInfo = {
    remaining: parseInt(response.headers.get("x-ratelimit-remaining") || "0"),
    limit: parseInt(response.headers.get("x-ratelimit-limit") || "0"),
    reset: new Date(parseInt(response.headers.get("x-ratelimit-reset") || "0") * 1000),
  };
  
  if (!response.ok) {
    if (response.status === 403 && rateLimit.remaining === 0) {
      throw new Error(`Rate limited. Resets at ${rateLimit.reset.toLocaleTimeString()}`);
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  const data: GitHubSearchResult = await response.json();
  
  // Search API returns minimal user info, we need to fetch full profiles
  // But to avoid rate limits, we'll return the basic info and fetch details on demand
  return {
    users: data.items,
    total: data.total_count,
    rateLimit,
  };
}

/**
 * Get full user profile details
 */
export async function getUserProfile(username: string): Promise<GitHubUser> {
  const url = `https://api.github.com/users/${encodeURIComponent(username)}`;
  
  const response = await githubFetch(url);
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Batch fetch user profiles (with rate limit awareness)
 */
export async function getUserProfiles(usernames: string[]): Promise<GitHubUser[]> {
  const profiles: GitHubUser[] = [];
  
  for (const username of usernames) {
    try {
      const profile = await getUserProfile(username);
      profiles.push(profile);
    } catch (e) {
      console.error(`Failed to fetch profile for ${username}:`, e);
      // Continue with next user
    }
  }
  
  return profiles;
}

/**
 * Search for GitHub users in Newfoundland
 */
export async function searchNewfoundlandUsers(
  page: number = 1,
  perPage: number = 30
): Promise<{ users: GitHubUser[]; total: number; rateLimit: RateLimitInfo }> {
  // Use simple location search - "Newfoundland" captures most users
  // GitHub's location field is free-text so this catches variations like:
  // "St. John's, Newfoundland", "Newfoundland, Canada", etc.
  const query = encodeURIComponent("location:Newfoundland type:user");
  const url = `https://api.github.com/search/users?q=${query}&page=${page}&per_page=${perPage}`;
  
  const response = await githubFetch(url);
  
  const rateLimit: RateLimitInfo = {
    remaining: parseInt(response.headers.get("x-ratelimit-remaining") || "0"),
    limit: parseInt(response.headers.get("x-ratelimit-limit") || "0"),
    reset: new Date(parseInt(response.headers.get("x-ratelimit-reset") || "0") * 1000),
  };
  
  if (!response.ok) {
    if (response.status === 403 && rateLimit.remaining === 0) {
      throw new Error(`Rate limited. Resets at ${rateLimit.reset.toLocaleTimeString()}`);
    }
    const body = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${body}`);
  }
  
  const data: GitHubSearchResult = await response.json();
  
  return {
    users: data.items,
    total: data.total_count,
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
 * Get current rate limit status without making a counting request
 */
export async function getRateLimitStatus(): Promise<RateLimitInfo> {
  const response = await githubFetch("https://api.github.com/rate_limit");
  
  if (!response.ok) {
    return {
      remaining: 0,
      limit: 0,
      reset: new Date(),
    };
  }
  
  const data = await response.json();
  return {
    remaining: data.resources.core.remaining,
    limit: data.resources.core.limit,
    reset: new Date(data.resources.core.reset * 1000),
  };
}

/**
 * Get user's social accounts
 */
export async function getUserSocialAccounts(username: string): Promise<GitHubSocialAccount[]> {
  const url = `https://api.github.com/users/${encodeURIComponent(username)}/social_accounts`;
  const response = await githubFetch(url);
  
  if (!response.ok) {
    // Social accounts endpoint may not exist for all users, return empty
    return [];
  }
  
  return response.json();
}

/**
 * Get user profile with rate limit info returned
 */
export async function getUserProfileWithRateLimit(username: string): Promise<{ 
  user: GitHubUserWithSocials; 
  rateLimit: RateLimitInfo 
}> {
  const url = `https://api.github.com/users/${encodeURIComponent(username)}`;
  const response = await githubFetch(url);
  
  const rateLimit: RateLimitInfo = {
    remaining: parseInt(response.headers.get("x-ratelimit-remaining") || "0"),
    limit: parseInt(response.headers.get("x-ratelimit-limit") || "0"),
    reset: new Date(parseInt(response.headers.get("x-ratelimit-reset") || "0") * 1000),
  };
  
  if (!response.ok) {
    if (response.status === 403 && rateLimit.remaining === 0) {
      throw new Error(`RATE_LIMITED:${rateLimit.reset.getTime()}`);
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  const user: GitHubUser = await response.json();
  
  // Fetch social accounts (costs 1 more API call but gives us valuable data)
  const socialAccounts = await getUserSocialAccounts(username);
  
  return { 
    user: { ...user, socialAccounts }, 
    rateLimit 
  };
}

// Export the RateLimitInfo type
export type { RateLimitInfo };
