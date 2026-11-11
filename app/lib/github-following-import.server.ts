import { randomUUID } from "node:crypto";
import { db } from "~/db";
import { importJobs, type ImportJob } from "~/db/schema";
import { eq } from "drizzle-orm";
import { withWorkLock } from "./work-lock.server";
import { importRunState, assertImportRun } from "./github-import-state.server";
import type { FollowingImportData } from "./github.types";
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
const BATCH_SIZE = 10;
const readJob = () => db.select().from(importJobs).where(eq(importJobs.id, JOB_ID)).get();
function updateJob(patch: Partial<typeof importJobs.$inferInsert>) {
  db.update(importJobs)
    .set({ ...patch, lastActivity: new Date() })
    .where(eq(importJobs.id, JOB_ID))
    .run();
}
export interface FollowingImportProgress {
  status: ImportJob["status"];
  runId: string | null;
  pauseReason: "user" | "rate_limit" | null;
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
  users: GitHubUserBasic[];
  profiles: GitHubUser[];
  errors: string[];
}
export async function getFollowingImportProgress(): Promise<FollowingImportProgress> {
  const job = readJob();
  const data = job?.payload;
  return {
    ...importRunState(job),
    status: job?.status ?? "idle",
    sourceUsername: data?.sourceUsername ?? null,
    mode: data?.mode ?? null,
    totalUsers: job?.totalItems ?? 0,
    fetchedProfiles: job?.processedItems ?? 0,
    errorCount: job?.errorCount ?? 0,
    rateLimitRemaining: job?.rateLimitRemaining ?? null,
    rateLimitReset: job?.rateLimitReset ? new Date(job.rateLimitReset * 1000) : null,
    lastError: job?.lastError ?? null,
    canResume: !!data && importRunState(job).canResume,
    users: data?.users ?? [],
    profiles: data?.profiles ?? [],
    errors: data?.errors ?? [],
  };
}
export function startFollowingImport(username: string, mode: FollowingImportData["mode"]) {
  return withWorkLock(JOB_ID, async () => {
    db.delete(importJobs).where(eq(importJobs.id, JOB_ID)).run();
    const runId = randomUUID();
    try {
      let users: GitHubUserBasic[] = [];
      let rateLimit: RateLimitInfo = { remaining: 0, limit: 0, reset: new Date() };
      if (mode === "following" || mode === "both") {
        const result = await getAllUserFollowing(username);
        users = result.users;
        rateLimit = result.rateLimit;
      }
      if (mode === "followers" || mode === "both") {
        const result = await getAllUserFollowers(username);
        const logins = new Set(users.map((user) => user.login));
        users = [...users, ...result.users.filter((user) => !logins.has(user.login))];
        rateLimit = result.rateLimit;
      }
      db.insert(importJobs)
        .values({
          id: JOB_ID,
          runId,
          status: users.length ? "running" : "completed",
          totalItems: users.length,
          payload: {
            sourceUsername: username,
            mode,
            users,
            pendingUsernames: users.map((user) => user.login),
            profiles: [],
            errors: [],
          },
          rateLimitRemaining: rateLimit.remaining,
          rateLimitReset: Math.floor(rateLimit.reset.getTime() / 1000),
        })
        .run();
    } catch (error) {
      db.insert(importJobs)
        .values({
          id: JOB_ID,
          runId,
          status: "failed",
          lastError: error instanceof Error ? error.message : String(error),
        })
        .run();
    }
    return getFollowingImportProgress();
  });
}
export function processFollowingBatch(runId: string) {
  return withWorkLock(JOB_ID, async () => {
    const job = readJob();
    assertImportRun(job, runId);
    if (!job || job.status !== "running" || !job.payload) return getFollowingImportProgress();
    const data = job.payload;
    try {
      const rate = await getRateLimitStatus();
      if (rate.remaining < BATCH_SIZE + 5) {
        updateJob({
          status: "paused",
          pauseReason: "rate_limit",
          rateLimitRemaining: rate.remaining,
          rateLimitReset: Math.floor(rate.reset.getTime() / 1000),
          lastError: "Waiting for GitHub rate limit reset",
        });
        return getFollowingImportProgress();
      }
      for (const username of data.pendingUsernames.slice(0, BATCH_SIZE)) {
        try {
          data.profiles.push(await getUserProfile(username));
        } catch (error) {
          data.errors.push(
            `${username}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        data.pendingUsernames.shift();
        // Checkpoint every profile so a later API failure does not discard completed work.
        updateJob({
          payload: data,
          processedItems: (job.totalItems ?? 0) - data.pendingUsernames.length,
          errorCount: data.errors.length,
        });
      }
      const rateAfter = await getRateLimitStatus();
      updateJob({
        status: data.pendingUsernames.length ? "running" : "completed",
        pauseReason: null,
        rateLimitRemaining: rateAfter.remaining,
        rateLimitReset: Math.floor(rateAfter.reset.getTime() / 1000),
        lastError: null,
      });
    } catch (error) {
      updateJob({
        status: "failed",
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
    return getFollowingImportProgress();
  });
}
export function resumeFollowingImport(runId: string) {
  return withWorkLock(JOB_ID, async () => {
    const job = readJob();
    assertImportRun(job, runId);
    const state = importRunState(job);
    if (job?.payload && state.canResume && !state.waitingForRateLimit)
      updateJob({ status: "running", pauseReason: null, lastError: null });
    return getFollowingImportProgress();
  });
}
export function pauseFollowingImport(runId: string) {
  return withWorkLock(
    JOB_ID,
    async () => {
      const job = readJob();
      assertImportRun(job, runId);
      if (job?.status === "running") updateJob({ status: "paused", pauseReason: "user" });
      return getFollowingImportProgress();
    },
    "wait",
  );
}
export function resetFollowingImport(runId: string) {
  return withWorkLock(
    JOB_ID,
    async () => {
      assertImportRun(readJob(), runId);
      db.delete(importJobs).where(eq(importJobs.id, JOB_ID)).run();
      return getFollowingImportProgress();
    },
    "wait",
  );
}
