/**
 * GitHub Following Import Job Service
 * 
 * Handles fetching full profiles for a user's following/followers list.
 * Progress is persisted to allow resuming and prevent hammering the API.
 */

import { db } from "~/db";
import { importJobs, type ImportJob } from "~/db/schema";
import { eq } from "drizzle-orm";
import { 
  getAllUserFollowing,
  getAllUserFollowers,
  getUserProfile,
  getRateLimitStatus,
  type GitHubUser,
  type GitHubUserBasic,
  type RateLimitInfo,
} from "./github.server";

const JOB_ID = "github-following";
const BATCH_SIZE = 10; // Process 10 users per batch

export interface FollowingImportProgress {
  status: ImportJob["status"];
  sourceUsername: string | null;
  mode: "following" | "followers" | "both" | null;
  totalUsers: number;
  fetchedProfiles: number;
  errorCount: number;
  rateLimitRemaining: number | null;
  rateLimitReset: Date | null;
  lastError: string | null;
  canResume: boolean;
  waitingForRateLimit: boolean;
  // The actual data
  users: GitHubUserBasic[];
  profiles: GitHubUser[];
  errors: string[];
}

// In-memory storage for the job data (usernames to fetch, fetched profiles)
// This is fine since jobs are short-lived and per-session
let jobData: {
  sourceUsername: string;
  mode: "following" | "followers" | "both";
  users: GitHubUserBasic[];
  pendingUsernames: string[];
  profiles: GitHubUser[];
  errors: string[];
} | null = null;

/**
 * Get current job progress
 */
export async function getFollowingImportProgress(): Promise<FollowingImportProgress> {
  const job = await db.select().from(importJobs).where(eq(importJobs.id, JOB_ID)).get();
  
  if (!job) {
    return {
      status: "idle",
      sourceUsername: null,
      mode: null,
      totalUsers: 0,
      fetchedProfiles: 0,
      errorCount: 0,
      rateLimitRemaining: null,
      rateLimitReset: null,
      lastError: null,
      canResume: false,
      waitingForRateLimit: false,
      users: [],
      profiles: [],
      errors: [],
    };
  }
  
  const now = Date.now();
  const resetTime = job.rateLimitReset ? job.rateLimitReset * 1000 : null;
  const waitingForRateLimit = job.status === "paused" && 
    job.rateLimitRemaining === 0 && 
    resetTime !== null && 
    resetTime > now;
  
  return {
    status: job.status as ImportJob["status"],
    sourceUsername: jobData?.sourceUsername ?? null,
    mode: jobData?.mode ?? null,
    totalUsers: job.totalItems ?? 0,
    fetchedProfiles: job.processedItems ?? 0,
    errorCount: job.errorCount ?? 0,
    rateLimitRemaining: job.rateLimitRemaining,
    rateLimitReset: job.rateLimitReset ? new Date(job.rateLimitReset * 1000) : null,
    lastError: job.lastError,
    canResume: job.status === "paused" || job.status === "error",
    waitingForRateLimit,
    users: jobData?.users ?? [],
    profiles: jobData?.profiles ?? [],
    errors: jobData?.errors ?? [],
  };
}

/**
 * Start a new following import job
 */
export async function startFollowingImport(
  username: string,
  mode: "following" | "followers" | "both"
): Promise<FollowingImportProgress> {
  // Clear any existing job
  await db.delete(importJobs).where(eq(importJobs.id, JOB_ID));
  jobData = null;
  
  try {
    // Fetch the user list (this is cheap - paginated list endpoints)
    let allUsers: GitHubUserBasic[] = [];
    let rateLimit: RateLimitInfo = { remaining: 0, limit: 0, reset: new Date() };
    
    if (mode === "following" || mode === "both") {
      const result = await getAllUserFollowing(username);
      allUsers.push(...result.users);
      rateLimit = result.rateLimit;
    }
    
    if (mode === "followers" || mode === "both") {
      const result = await getAllUserFollowers(username);
      // Dedupe by login
      const existingLogins = new Set(allUsers.map(u => u.login));
      for (const user of result.users) {
        if (!existingLogins.has(user.login)) {
          allUsers.push(user);
        }
      }
      rateLimit = result.rateLimit;
    }
    
    if (allUsers.length === 0) {
      return {
        status: "completed",
        sourceUsername: username,
        mode,
        totalUsers: 0,
        fetchedProfiles: 0,
        errorCount: 0,
        rateLimitRemaining: rateLimit.remaining,
        rateLimitReset: rateLimit.reset,
        lastError: null,
        canResume: false,
        waitingForRateLimit: false,
        users: [],
        profiles: [],
        errors: [],
      };
    }
    
    // Store job data in memory
    jobData = {
      sourceUsername: username,
      mode,
      users: allUsers,
      pendingUsernames: allUsers.map(u => u.login),
      profiles: [],
      errors: [],
    };
    
    // Create job record in DB
    await db.insert(importJobs).values({
      id: JOB_ID,
      status: "running",
      totalItems: allUsers.length,
      processedItems: 0,
      errorCount: 0,
      rateLimitRemaining: rateLimit.remaining,
      rateLimitReset: Math.floor(rateLimit.reset.getTime() / 1000),
      lastActivity: new Date(),
      createdAt: new Date(),
    });
    
    return getFollowingImportProgress();
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    await db.insert(importJobs).values({
      id: JOB_ID,
      status: "error",
      lastError: errorMsg,
      lastActivity: new Date(),
      createdAt: new Date(),
    });
    return getFollowingImportProgress();
  }
}

/**
 * Process the next batch of profiles
 */
export async function processFollowingBatch(): Promise<FollowingImportProgress> {
  const job = await db.select().from(importJobs).where(eq(importJobs.id, JOB_ID)).get();
  
  if (!job || job.status !== "running" || !jobData) {
    return getFollowingImportProgress();
  }
  
  // Check rate limit before starting
  const currentRateLimit = await getRateLimitStatus();
  if (currentRateLimit.remaining < BATCH_SIZE + 5) {
    // Not enough requests, pause
    await db.update(importJobs)
      .set({
        status: "paused",
        rateLimitRemaining: currentRateLimit.remaining,
        rateLimitReset: Math.floor(currentRateLimit.reset.getTime() / 1000),
        lastError: `Paused: only ${currentRateLimit.remaining} API requests remaining`,
        lastActivity: new Date(),
      })
      .where(eq(importJobs.id, JOB_ID));
    return getFollowingImportProgress();
  }
  
  // Get next batch of usernames
  const batch = jobData.pendingUsernames.slice(0, BATCH_SIZE);
  if (batch.length === 0) {
    // All done!
    await db.update(importJobs)
      .set({
        status: "completed",
        lastActivity: new Date(),
      })
      .where(eq(importJobs.id, JOB_ID));
    return getFollowingImportProgress();
  }
  
  // Fetch profiles for this batch
  let errorCount = job.errorCount ?? 0;
  
  for (const username of batch) {
    try {
      const profile = await getUserProfile(username);
      jobData.profiles.push(profile);
    } catch (e) {
      const errorMsg = `${username}: ${e instanceof Error ? e.message : String(e)}`;
      jobData.errors.push(errorMsg);
      errorCount++;
      console.error(`Failed to fetch profile for ${username}:`, e);
    }
  }
  
  // Remove processed usernames from pending
  jobData.pendingUsernames = jobData.pendingUsernames.slice(BATCH_SIZE);
  
  // Update progress in DB
  const processedItems = (job.processedItems ?? 0) + batch.length;
  const isComplete = jobData.pendingUsernames.length === 0;
  
  // Get updated rate limit
  const newRateLimit = await getRateLimitStatus();
  
  await db.update(importJobs)
    .set({
      status: isComplete ? "completed" : "running",
      processedItems,
      errorCount,
      rateLimitRemaining: newRateLimit.remaining,
      rateLimitReset: Math.floor(newRateLimit.reset.getTime() / 1000),
      lastError: null,
      lastActivity: new Date(),
    })
    .where(eq(importJobs.id, JOB_ID));
  
  return getFollowingImportProgress();
}

/**
 * Resume a paused job
 */
export async function resumeFollowingImport(): Promise<FollowingImportProgress> {
  const job = await db.select().from(importJobs).where(eq(importJobs.id, JOB_ID)).get();
  
  if (!job || !jobData) {
    return getFollowingImportProgress();
  }
  
  if (job.status === "paused" || job.status === "error") {
    await db.update(importJobs)
      .set({
        status: "running",
        lastError: null,
        lastActivity: new Date(),
      })
      .where(eq(importJobs.id, JOB_ID));
  }
  
  return getFollowingImportProgress();
}

/**
 * Pause the job
 */
export async function pauseFollowingImport(): Promise<FollowingImportProgress> {
  await db.update(importJobs)
    .set({
      status: "paused",
      lastActivity: new Date(),
    })
    .where(eq(importJobs.id, JOB_ID));
  
  return getFollowingImportProgress();
}

/**
 * Reset/cancel the job
 */
export async function resetFollowingImport(): Promise<FollowingImportProgress> {
  await db.delete(importJobs).where(eq(importJobs.id, JOB_ID));
  jobData = null;
  return getFollowingImportProgress();
}
