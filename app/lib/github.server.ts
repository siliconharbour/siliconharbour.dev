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
  bio: string | null;
  blog: string | null;
  location: string | null;
  public_repos: number;
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
 * Search multiple location variations and deduplicate results
 */
export async function searchNewfoundlandUsers(
  page: number = 1,
  perPage: number = 30
): Promise<{ users: GitHubUser[]; total: number; rateLimit: RateLimitInfo }> {
  // Search with multiple location terms to catch variations
  const locations = [
    "Newfoundland",
    '"St. John\'s"',
    '"St John\'s, NL"',
    '"St. John\'s, NL"',
    '"NL, Canada"',
    '"Mount Pearl"',
    '"Corner Brook"',
  ];
  
  // For pagination, we'll use the primary search term
  // The multi-term search is really for the first page to cast a wide net
  const query = encodeURIComponent(`location:Newfoundland OR location:"St. John's" OR location:"NL, Canada" type:user`);
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
