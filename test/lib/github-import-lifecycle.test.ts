import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "~/db";
import { importJobs } from "~/db/schema";
import * as github from "~/lib/github.server";
import * as following from "~/lib/github-following-import.server";
import * as location from "~/lib/github-import.server";

vi.mock("~/lib/github.server", () => ({
  getAllUserFollowing: vi.fn(),
  getAllUserFollowers: vi.fn(),
  getUserProfile: vi.fn(),
  getRateLimitStatus: vi.fn(),
  searchNewfoundlandUsers: vi.fn(),
  getUserProfileWithRateLimit: vi.fn(),
  clearNewfoundlandUsersCache: vi.fn(),
  fetchAvatar: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
const rate = (remaining = 100) => ({
  remaining,
  limit: 5000,
  reset: new Date(Date.now() + 60_000),
});
const basic = {
  login: "person",
  id: 1,
  avatar_url: "https://example.com/avatar",
  html_url: "https://github.com/person",
};
const profile = {
  ...basic,
  name: "Person",
  company: null,
  bio: null,
  blog: null,
  location: "St. John's",
  public_repos: 0,
  twitter_username: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function start(users = [basic]) {
  vi.mocked(github.getAllUserFollowing).mockResolvedValue({ users, rateLimit: rate() });
  vi.mocked(github.getRateLimitStatus).mockResolvedValue(rate());
  vi.mocked(github.getUserProfile).mockResolvedValue(profile);
  return following.startFollowingImport("someone", "following");
}
it("persists following results across module restart and stores empty completion", async () => {
  const started = await start();
  await following.processFollowingBatch(started.runId!);
  vi.resetModules();
  const restarted = await import("~/lib/github-following-import.server");
  expect(await restarted.getFollowingImportProgress()).toMatchObject({
    status: "completed",
    runId: started.runId,
    profiles: [profile],
  });
  await restarted.pauseFollowingImport(started.runId!);
  expect((await restarted.getFollowingImportProgress()).status).toBe("completed");
  const empty = await start([]);
  expect(empty.status).toBe("completed");
  expect((await following.getFollowingImportProgress()).runId).toBe(empty.runId);
});
it("distinguishes low-quota pauses from user pauses and preserves checkpoints on API failure", async () => {
  const started = await start();
  vi.mocked(github.getRateLimitStatus).mockResolvedValue(rate(8));
  expect(await following.processFollowingBatch(started.runId!)).toMatchObject({
    status: "paused",
    pauseReason: "rate_limit",
    waitingForRateLimit: true,
  });
  expect((await following.resumeFollowingImport(started.runId!)).status).toBe("paused");
  await db.update(importJobs).set({ rateLimitReset: Math.floor(Date.now() / 1000) - 1 });
  await following.resumeFollowingImport(started.runId!);
  vi.mocked(github.getRateLimitStatus)
    .mockResolvedValueOnce(rate())
    .mockRejectedValueOnce(new Error("quota API unavailable"));
  expect(await following.processFollowingBatch(started.runId!)).toMatchObject({
    status: "failed",
    fetchedProfiles: 1,
    profiles: [profile],
    canResume: true,
  });
  vi.mocked(github.getRateLimitStatus).mockResolvedValue(rate());
  await following.resumeFollowingImport(started.runId!);
  expect((await following.processFollowingBatch(started.runId!)).status).toBe("completed");
  expect(github.getUserProfile).toHaveBeenCalledOnce();
});
it("rejects overlapping batches and applies reset after in-flight work without resurrecting it", async () => {
  const started = await start();
  const pending = deferred<typeof profile>();
  vi.mocked(github.getUserProfile).mockReturnValue(pending.promise);
  const batch = following.processFollowingBatch(started.runId!);
  await vi.waitFor(() => expect(github.getUserProfile).toHaveBeenCalled());
  await expect(following.processFollowingBatch(started.runId!)).rejects.toThrow(
    "already in progress",
  );
  const reset = following.resetFollowingImport(started.runId!);
  await expect(following.startFollowingImport("other", "following")).rejects.toThrow(
    "already in progress",
  );
  pending.resolve(profile);
  await batch;
  expect((await reset).status).toBe("idle");
  expect((await following.getFollowingImportProgress()).profiles).toEqual([]);
});
it("waits for a location batch before pausing and keeps its completed work", async () => {
  vi.mocked(github.searchNewfoundlandUsers).mockResolvedValue({
    users: [basic],
    total: 10,
    rateLimit: rate(),
  });
  const initial = await location.startImport();
  const pending = deferred<{
    user: typeof profile & { socialAccounts: [] };
    rateLimit: ReturnType<typeof rate>;
  }>();
  vi.mocked(github.getUserProfileWithRateLimit).mockReturnValue(pending.promise);
  const batch = location.processNextBatch(initial.runId!, false);
  await vi.waitFor(() => expect(github.getUserProfileWithRateLimit).toHaveBeenCalled());
  const pause = location.pauseImport(initial.runId!);
  pending.resolve({ user: { ...profile, socialAccounts: [] }, rateLimit: rate() });
  await batch;
  expect(await pause).toMatchObject({
    status: "paused",
    pauseReason: "user",
    waitingForRateLimit: false,
    processedItems: 1,
    runId: initial.runId,
  });
  expect(await location.startImport(initial.runId!)).toMatchObject({
    status: "running",
    pauseReason: null,
    runId: initial.runId,
  });
  await location.resetImport(initial.runId!);
  expect((await location.startImport()).runId).not.toBe(initial.runId);
  await expect(location.pauseImport(initial.runId!)).rejects.toThrow("run has changed");
});

it("migrates existing progress without inventing a lost following queue", () => {
  const sqlite = new Database(":memory:");
  try {
    sqlite.exec(`CREATE TABLE import_jobs (id text PRIMARY KEY, status text, rate_limit_reset integer, last_error text);
      INSERT INTO import_jobs VALUES ('github-following', 'running', NULL, NULL), ('github-newfoundland', 'paused', 123, NULL), ('failed-run', 'error', NULL, 'Network failed');`);
    for (const statement of readFileSync("drizzle/0063_import_run_state.sql", "utf8").split(
      "--> statement-breakpoint",
    ))
      sqlite.exec(statement);
    expect(
      sqlite
        .prepare("SELECT status, payload, last_error FROM import_jobs WHERE id='github-following'")
        .get(),
    ).toEqual({
      status: "failed",
      payload: null,
      last_error: "Following import data is unavailable. Start a new import.",
    });
    expect(
      sqlite
        .prepare("SELECT status, pause_reason FROM import_jobs WHERE id='github-newfoundland'")
        .get(),
    ).toEqual({ status: "paused", pause_reason: "rate_limit" });
    expect(
      sqlite.prepare("SELECT status, last_error FROM import_jobs WHERE id='failed-run'").get(),
    ).toEqual({ status: "failed", last_error: "Network failed" });
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM import_jobs WHERE length(run_id)>0").get(),
    ).toEqual({ n: 3 });
  } finally {
    sqlite.close();
  }
});
