import { z } from "zod";
import { defineOperation } from "../define";
import { emptyInput, confirm } from "../fields";
import { toPlain } from "../plain";
import {
  githubImportInput,
  importBatchOutput,
  githubSearchInput,
  githubSearchOutput,
  githubProgressOutput,
  githubContinueInput,
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
const confirmed = emptyInput.extend({ confirm }).strict();
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
      "Initialize the existing location import and live GitHub search. Requires confirm: true. Advance it with githubLocationBulkContinue and poll githubLocationBulkStatus.",
    input: confirmed,
    output: githubProgressOutput,
    examples: [{ title: "Start import", input: { confirm: true } }],
    run: async () => toPlain(await startImport()),
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
    examples: [{ title: "Next batch", input: { confirm: true } }],
    run: async (_ctx, { downloadAvatars }) => toPlain(await processNextBatch(downloadAvatars)),
  }),
  githubLocationBulkPause: defineOperation({
    name: "githubLocationBulkPause",
    area: "importers",
    risk: "write",
    access: "admin",
    summary: "Pause the bulk GitHub location import.",
    description:
      "Persist the paused state without fetching more profiles. Existing imported records are retained.",
    input: emptyInput,
    output: githubProgressOutput,
    examples: [{ title: "Pause", input: {} }],
    run: async () => toPlain(await pauseImport()),
  }),
  githubLocationBulkReset: defineOperation({
    name: "githubLocationBulkReset",
    area: "importers",
    risk: "destructive",
    access: "admin",
    summary: "Reset bulk GitHub location import progress.",
    description:
      "Clear import progress without deleting imported directory records. Requires confirm: true.",
    input: confirmed,
    output: githubProgressOutput,
    examples: [{ title: "Reset", input: { confirm: true } }],
    run: async () => toPlain(await resetImport()),
  }),
  githubFollowingStatus: defineOperation({
    name: "githubFollowingStatus",
    area: "importers",
    risk: "read",
    access: "admin",
    summary: "Get GitHub connection import progress and profiles.",
    description:
      "Read the current following/follower job state and fetched profiles without advancing it.",
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
      "Advance the active job using the existing rate-limit behavior. This gathers profiles without creating people. Requires confirm: true.",
    input: confirmed,
    output: githubFollowingOutput,
    examples: [{ title: "Next batch", input: { confirm: true } }],
    run: async () => toPlain(await processFollowingBatch()),
  }),
  githubFollowingResume: defineOperation({
    name: "githubFollowingResume",
    area: "importers",
    risk: "external",
    access: "admin",
    summary: "Resume a paused GitHub connection job.",
    description:
      "Resume the existing following/follower job and its live GitHub work. Requires confirm: true.",
    input: confirmed,
    output: githubFollowingOutput,
    examples: [{ title: "Resume", input: { confirm: true } }],
    run: async () => toPlain(await resumeFollowingImport()),
  }),
  githubFollowingPause: defineOperation({
    name: "githubFollowingPause",
    area: "importers",
    risk: "write",
    access: "admin",
    summary: "Pause a GitHub connection job.",
    description:
      "Persist paused progress and retain fetched profiles without making another GitHub request.",
    input: emptyInput,
    output: githubFollowingOutput,
    examples: [{ title: "Pause", input: {} }],
    run: async () => toPlain(await pauseFollowingImport()),
  }),
  githubFollowingReset: defineOperation({
    name: "githubFollowingReset",
    area: "importers",
    risk: "destructive",
    access: "admin",
    summary: "Reset a GitHub connection import job.",
    description:
      "Clear job progress and fetched profiles without deleting people already imported. Requires confirm: true.",
    input: confirmed,
    output: githubFollowingOutput,
    examples: [{ title: "Reset", input: { confirm: true } }],
    run: async () => toPlain(await resetFollowingImport()),
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
