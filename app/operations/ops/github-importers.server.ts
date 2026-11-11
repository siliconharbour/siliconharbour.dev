import { z } from "zod";
import { defineOperation } from "../define";
import { emptyInput } from "../fields";
import { toPlain } from "../plain";
import {
  githubImportInput,
  importBatchOutput,
  githubSearchInput,
  githubSearchOutput,
  githubProgressOutput,
  githubContinueInput,
  githubRunInput,
  githubRunConfirmedInput,
  githubLocationStartInput,
  githubFollowingStartInput,
  githubFollowingOutput,
} from "../contracts/importers";
import { searchNewfoundlandUsers, getUserProfiles } from "~/lib/github.server";
import {
  getImportProgress,
  startImport,
  processNextBatch,
  pauseImport,
  resetImport,
} from "~/lib/github-import.server";
import {
  getFollowingImportProgress,
  startFollowingImport,
  processFollowingBatch,
  resumeFollowingImport,
  pauseFollowingImport,
  resetFollowingImport,
} from "~/lib/github-following-import.server";
import { importGithubProfiles } from "~/lib/github-profile-import.server";
export const githubImporterOperations = {
  githubLocationSearch: defineOperation({
    name: "githubLocationSearch",
    area: "importers",
    risk: "external",
    access: "admin",
    summary: "Search GitHub for Newfoundland profiles.",
    description:
      "Run the existing location search terms, fetch full profiles for one page, and return rate-limit metadata without importing people. Requires confirm: true.",
    input: githubSearchInput,
    output: githubSearchOutput,
    examples: [{ title: "First page", input: { confirm: true } }],
    run: async (_ctx, { page }) => {
      const result = await searchNewfoundlandUsers(page, 30);
      return toPlain({
        users: await getUserProfiles(result.users.map((user) => user.login)),
        total: result.total,
        page,
        rateLimit: result.rateLimit,
      });
    },
  }),
  githubLocationImport: defineOperation({
    name: "githubLocationImport",
    area: "importers",
    risk: "write",
    access: "admin",
    summary: "Import reviewed GitHub location profiles.",
    description:
      "Skip blocklisted identities. Merge missing GitHub details into unlinked people or create hidden people, synchronize company references, and optionally fetch avatars through the image guard. Return per-profile results.",
    input: githubImportInput,
    output: importBatchOutput,
    examples: [
      {
        title: "Import profile",
        input: {
          users: [
            {
              login: "example",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
              html_url: "https://github.com/example",
              name: null,
              company: null,
              bio: null,
              blog: null,
              location: null,
              public_repos: 0,
              twitter_username: null,
            },
          ],
        },
      },
    ],
    run: (_ctx, input) => importGithubProfiles("location", input.users, input.downloadAvatars),
  }),
  githubLocationBulkStatus: defineOperation({
    name: "githubLocationBulkStatus",
    area: "importers",
    risk: "read",
    access: "admin",
    summary: "Get bulk GitHub location import progress.",
    description:
      "Read stored progress and rate-limit status without advancing the import. Poll after githubLocationBulkStart or Continue.",
    input: emptyInput,
    output: githubProgressOutput,
    examples: [{ title: "Progress", input: {} }],
    run: async () => toPlain(await getImportProgress()),
  }),
  githubLocationBulkStart: defineOperation({
    name: "githubLocationBulkStart",
    area: "importers",
    risk: "external",
    access: "admin",
    summary: "Start the bulk GitHub location import.",
    description:
      "Initialize or resume the location import. Completed runs require reset before restarting. Requires confirm: true. Advance it with githubLocationBulkContinue and poll githubLocationBulkStatus.",
    input: githubLocationStartInput,
    output: githubProgressOutput,
    examples: [{ title: "Start import", input: { runId: null, confirm: true } }],
    run: async (_ctx, { runId }) => toPlain(await startImport(runId)),
  }),
  githubLocationBulkContinue: defineOperation({
    name: "githubLocationBulkContinue",
    area: "importers",
    risk: "external",
    access: "admin",
    summary: "Process the next GitHub location import batch.",
    description:
      "Fetch profiles and apply the existing import rules, optionally downloading guarded avatars. Respect importer rate limits. Requires confirm: true.",
    input: githubContinueInput,
    output: z
      .object({
        progress: githubProgressOutput,
        processed: z.array(z.string()),
        errors: z.array(z.string()),
      })
      .strict(),
    examples: [{ title: "Next batch", input: { runId: "run", confirm: true } }],
    run: async (_ctx, { runId, downloadAvatars }) =>
      toPlain(await processNextBatch(runId, downloadAvatars)),
  }),
  githubLocationBulkPause: defineOperation({
    name: "githubLocationBulkPause",
    area: "importers",
    risk: "write",
    access: "admin",
    summary: "Pause the bulk GitHub location import.",
    description:
      "Wait for the active batch to finish, then pause. Existing imported records are retained.",
    input: githubRunInput,
    output: githubProgressOutput,
    examples: [{ title: "Pause", input: { runId: "run" } }],
    run: async (_ctx, { runId }) => toPlain(await pauseImport(runId)),
  }),
  githubLocationBulkReset: defineOperation({
    name: "githubLocationBulkReset",
    area: "importers",
    risk: "destructive",
    access: "admin",
    summary: "Reset bulk GitHub location import progress.",
    description:
      "Wait for the active batch to finish, then clear progress without deleting imported directory records. Requires confirm: true.",
    input: githubRunConfirmedInput,
    output: githubProgressOutput,
    examples: [{ title: "Reset", input: { runId: "run", confirm: true } }],
    run: async (_ctx, { runId }) => toPlain(await resetImport(runId)),
  }),
  githubFollowingStatus: defineOperation({
    name: "githubFollowingStatus",
    area: "importers",
    risk: "read",
    access: "admin",
    summary: "Get GitHub connection import progress and profiles.",
    description:
      "Read persisted run identity, pause reason, queue progress and fetched profiles without advancing the job. Profiles survive server restarts.",
    input: emptyInput,
    output: githubFollowingOutput,
    examples: [{ title: "Progress", input: {} }],
    run: async () => toPlain(await getFollowingImportProgress()),
  }),
  githubFollowingStart: defineOperation({
    name: "githubFollowingStart",
    area: "importers",
    risk: "external",
    access: "admin",
    summary: "Start fetching a user's GitHub connections.",
    description:
      "Fetch following, followers, or both for username and initialize the existing import job. Requires confirm: true. Continue in batches and poll githubFollowingStatus.",
    input: githubFollowingStartInput,
    output: githubFollowingOutput,
    examples: [{ title: "Following", input: { username: "example", confirm: true } }],
    run: async (_ctx, { username, mode }) => toPlain(await startFollowingImport(username, mode)),
  }),
  githubFollowingContinue: defineOperation({
    name: "githubFollowingContinue",
    area: "importers",
    risk: "external",
    access: "admin",
    summary: "Fetch the next GitHub connection profile batch.",
    description:
      "Advance the active job and checkpoint each profile. Concurrent batch requests fail instead of replaying. This gathers profiles without creating people. Requires confirm: true.",
    input: githubRunConfirmedInput,
    output: githubFollowingOutput,
    examples: [{ title: "Next batch", input: { runId: "run", confirm: true } }],
    run: async (_ctx, { runId }) => toPlain(await processFollowingBatch(runId)),
  }),
  githubFollowingResume: defineOperation({
    name: "githubFollowingResume",
    area: "importers",
    risk: "external",
    access: "admin",
    summary: "Resume a paused GitHub connection job.",
    description:
      "Resume the existing following/follower job and its live GitHub work. Requires confirm: true.",
    input: githubRunConfirmedInput,
    output: githubFollowingOutput,
    examples: [{ title: "Resume", input: { runId: "run", confirm: true } }],
    run: async (_ctx, { runId }) => toPlain(await resumeFollowingImport(runId)),
  }),
  githubFollowingPause: defineOperation({
    name: "githubFollowingPause",
    area: "importers",
    risk: "write",
    access: "admin",
    summary: "Pause a GitHub connection job.",
    description: "Wait for the active batch to finish, then pause and retain fetched profiles.",
    input: githubRunInput,
    output: githubFollowingOutput,
    examples: [{ title: "Pause", input: { runId: "run" } }],
    run: async (_ctx, { runId }) => toPlain(await pauseFollowingImport(runId)),
  }),
  githubFollowingReset: defineOperation({
    name: "githubFollowingReset",
    area: "importers",
    risk: "destructive",
    access: "admin",
    summary: "Reset a GitHub connection import job.",
    description:
      "Wait for the active batch to finish, then clear progress and fetched profiles without deleting people already imported. Requires confirm: true.",
    input: githubRunConfirmedInput,
    output: githubFollowingOutput,
    examples: [{ title: "Reset", input: { runId: "run", confirm: true } }],
    run: async (_ctx, { runId }) => toPlain(await resetFollowingImport(runId)),
  }),
  githubFollowingImport: defineOperation({
    name: "githubFollowingImport",
    area: "importers",
    risk: "write",
    access: "admin",
    summary: "Import reviewed GitHub connection profiles.",
    description:
      "Skip blocklisted or existing identities and create hidden people. Synchronize company references and optionally download avatars through the public image guard. Return per-profile results.",
    input: githubImportInput,
    output: importBatchOutput,
    examples: [
      {
        title: "Import profile",
        input: {
          users: [
            {
              login: "example",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
              html_url: "https://github.com/example",
              name: null,
              company: null,
              bio: null,
              blog: null,
              location: null,
              public_repos: 0,
              twitter_username: null,
            },
          ],
        },
      },
    ],
    run: (_ctx, input) => importGithubProfiles("following", input.users, input.downloadAvatars),
  }),
};
