import type { Route } from "./+types/github-following";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useState, useMemo } from "react";
import { requireAuth } from "~/lib/session.server";
import { fetchAvatar } from "~/lib/github.server";
import type { GitHubUser, GitHubUserBasic } from "~/lib/github.types";
import {
  getFollowingImportProgress,
  startFollowingImport,
  processFollowingBatch,
  pauseFollowingImport,
  resetFollowingImport,
  resumeFollowingImport,
  type FollowingImportProgress,
} from "~/lib/github-following-import.server";
import {
  createPerson,
  getAllPeople,
  getPersonByName,
  getPersonByGitHub,
} from "~/lib/people.server";
import {
  findCompanyByFuzzyName,
  parseGitHubCompanyField,
  extractCompanyFromBio,
  updateCompany,
} from "~/lib/companies.server";
import { processAndSaveIconImageWithPadding } from "~/lib/images.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from GitHub Connections - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  // Get existing people for duplicate detection
  const existingPeople = await getAllPeople(true);
  const existingGitHubs = new Set(
    existingPeople.filter((p) => p.github).map((p) => p.github!.toLowerCase()),
  );

  // Get current job progress - this is the source of truth
  const progress = await getFollowingImportProgress();

  return {
    existingGitHubs: Array.from(existingGitHubs),
    progress,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Start fetching a user's following/followers
  if (intent === "start") {
    const username = (formData.get("username") as string)?.trim();
    const mode = (formData.get("mode") as "following" | "followers" | "both") || "following";

    if (!username) {
      return { intent, error: "Username is required" };
    }

    const progress = await startFollowingImport(username, mode);
    return { intent, progress, error: null };
  }

  // Continue processing profiles
  if (intent === "continue") {
    const progress = await processFollowingBatch();
    return { intent, progress, error: null };
  }

  // Resume a paused job
  if (intent === "resume") {
    const progress = await resumeFollowingImport();
    return { intent, progress, error: null };
  }

  // Pause the job
  if (intent === "pause") {
    const progress = await pauseFollowingImport();
    return { intent, progress, error: null };
  }

  // Reset/cancel the job
  if (intent === "reset") {
    const progress = await resetFollowingImport();
    return { intent, progress, error: null };
  }

  // Import selected users
  if (intent === "import") {
    const usersJson = formData.get("users") as string;
    const downloadAvatars = formData.get("downloadAvatars") === "true";

    try {
      const users: GitHubUser[] = JSON.parse(usersJson);
      const imported: string[] = [];
      const errors: string[] = [];

      for (const user of users) {
        try {
          let avatar: string | null = null;

          if (downloadAvatars && user.avatar_url) {
            const imageBuffer = await fetchAvatar(user.avatar_url);
            if (imageBuffer) {
              avatar = await processAndSaveIconImageWithPadding(imageBuffer);
            }
          }

          const githubUrl = user.html_url;
          const displayName = user.name || user.login;

          // Check if person already exists
          const existingByGitHub = await getPersonByGitHub(githubUrl);
          const existingByName = await getPersonByName(displayName);

          if (existingByGitHub || existingByName) {
            imported.push(`${displayName} (skipped - already exists)`);
            continue;
          }

          // Try to find company
          let companyName: string | null = null;
          let githubOrgUrl: string | null = null;
          let matchedCompany = null;

          if (user.company) {
            const parsed = parseGitHubCompanyField(user.company);
            companyName = parsed.name;
            githubOrgUrl = parsed.githubOrg;
            matchedCompany = await findCompanyByFuzzyName(parsed.name);
          }

          if (!companyName && user.bio) {
            const bioCompany = extractCompanyFromBio(user.bio);
            if (bioCompany) {
              companyName = bioCompany;
              matchedCompany = await findCompanyByFuzzyName(bioCompany);
            }
          }

          if (githubOrgUrl && matchedCompany && !matchedCompany.github) {
            await updateCompany(matchedCompany.id, { github: githubOrgUrl });
          }

          // Build bio
          let bio = user.bio || "";
          const companyRefName = matchedCompany?.name || companyName;

          if (companyRefName && !bio.toLowerCase().includes(companyRefName.toLowerCase())) {
            const companyRef = `[[${companyRefName}]]`;
            if (bio) {
              bio = `${bio}\n\nWorks at ${companyRef}.`;
            } else {
              bio = `GitHub user from ${user.location || "unknown location"}. Works at ${companyRef}.`;
            }
          } else if (!bio) {
            bio = `GitHub user from ${user.location || "unknown location"}.`;
          }

          await createPerson({
            name: displayName,
            bio,
            website: user.blog || null,
            github: githubUrl,
            avatar,
            visible: false,
          });

          imported.push(
            `${displayName}${matchedCompany ? ` (linked to ${matchedCompany.name})` : ""}`,
          );
        } catch (e) {
          errors.push(`${user.name || user.login}: ${String(e)}`);
        }
      }

      return { intent: "import", imported, errors };
    } catch (e) {
      return { intent: "import", imported: [], errors: [String(e)] };
    }
  }

  return null;
}

export default function ImportGitHubFollowing() {
  const { existingGitHubs, progress: loaderProgress } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<"following" | "followers" | "both">("following");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloadAvatars, setDownloadAvatars] = useState(true);

  // Progress comes from fetcher response (most recent) or loader (initial)
  const progress: FollowingImportProgress = fetcher.data?.progress ?? loaderProgress;

  // Simple handlers - NO useEffects, NO auto-run
  // User clicks a button, action runs, fetcher.data updates with new progress
  const handleStart = () => {
    fetcher.submit({ intent: "start", username, mode }, { method: "post" });
  };

  const handleContinue = () => {
    fetcher.submit({ intent: "continue" }, { method: "post" });
  };

  const handlePause = () => {
    fetcher.submit({ intent: "pause" }, { method: "post" });
  };

  const handleResume = () => {
    fetcher.submit({ intent: "resume" }, { method: "post" });
  };

  const handleReset = () => {
    setSelected(new Set());
    fetcher.submit({ intent: "reset" }, { method: "post" });
  };

  const isExisting = (user: GitHubUserBasic) => {
    return existingGitHubs.includes(user.html_url.toLowerCase());
  };

  const toggleSelect = (login: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(login)) {
      newSelected.delete(login);
    } else {
      newSelected.add(login);
    }
    setSelected(newSelected);
  };

  const selectAll = () => {
    const selectable = progress.profiles.filter((u) => !isExisting(u));
    setSelected(new Set(selectable.map((u) => u.login)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handleImport = () => {
    const toImport = progress.profiles.filter((u) => selected.has(u.login));
    fetcher.submit(
      {
        intent: "import",
        users: JSON.stringify(toImport),
        downloadAvatars: String(downloadAvatars),
      },
      { method: "post" },
    );
  };

  const isWorking = fetcher.state !== "idle";
  const isImporting = isWorking && fetcher.formData?.get("intent") === "import";

  // Group users by location
  const locationGroups = useMemo(() => {
    const groups = new Map<string, GitHubUser[]>();

    for (const profile of progress.profiles) {
      const location = profile.location?.trim() || "(no location)";
      if (!groups.has(location)) {
        groups.set(location, []);
      }
      groups.get(location)!.push(profile);
    }

    // Sort by count descending
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [progress.profiles]);

  const progressPercent =
    progress.totalUsers > 0
      ? Math.round((progress.fetchedProfiles / progress.totalUsers) * 100)
      : 0;

  const canContinue =
    progress.status === "running" && !isWorking && progress.fetchedProfiles < progress.totalUsers;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Dashboard
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">
            Import from GitHub Connections
          </h1>
        </div>

        <p className="text-harbour-500">
          Enter a GitHub username to fetch their following/followers and import them as people.
          Click "Fetch Next Batch" repeatedly to fetch profiles (10 at a time).
        </p>

        {/* Rate limit indicator */}
        {progress.rateLimitRemaining !== null && (
          <div className="text-sm text-harbour-400">
            API Rate Limit: {progress.rateLimitRemaining} remaining
            {progress.rateLimitRemaining < 50 && progress.rateLimitReset && (
              <span className="text-amber-600 ml-2">
                (Resets at {new Date(progress.rateLimitReset).toLocaleTimeString()})
              </span>
            )}
          </div>
        )}

        {/* Start new job */}
        {progress.status === "idle" && (
          <div className="flex items-center gap-4 flex-wrap">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="GitHub username"
              className="px-4 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none w-64"
              onKeyDown={(e) => {
                if (e.key === "Enter" && username.trim() && !isWorking) {
                  handleStart();
                }
              }}
            />

            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "following" | "followers" | "both")}
              className="px-4 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
              <option value="following">Following (who they follow)</option>
              <option value="followers">Followers (who follows them)</option>
              <option value="both">Both (combined, deduplicated)</option>
            </select>

            <button
              type="button"
              onClick={handleStart}
              disabled={!username.trim() || isWorking}
              className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
            >
              {isWorking ? "Starting..." : "Fetch Users"}
            </button>
          </div>
        )}

        {/* Job in progress */}
        {progress.status !== "idle" && (
          <div className="border border-harbour-200 p-4 bg-harbour-50 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-harbour-700">
                {progress.sourceUsername
                  ? `@${progress.sourceUsername}'s ${progress.mode}`
                  : "Stale job (server restarted?)"}
              </h2>

              <div className="flex items-center gap-2">
                {canContinue && (
                  <button
                    type="button"
                    onClick={handleContinue}
                    disabled={isWorking}
                    className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors"
                  >
                    {isWorking ? "Fetching..." : "Fetch Next Batch"}
                  </button>
                )}

                {progress.status === "running" && !canContinue && !isWorking && (
                  <button
                    type="button"
                    onClick={handlePause}
                    className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
                  >
                    Pause
                  </button>
                )}

                {progress.status === "paused" && (
                  <button
                    type="button"
                    onClick={handleResume}
                    disabled={isWorking}
                    className="px-3 py-1.5 text-sm bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
                  >
                    Resume
                  </button>
                )}

                {progress.status === "completed" && (
                  <span className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 font-medium">
                    Complete!
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isWorking}
                  className="px-3 py-1.5 text-sm border border-red-300 text-red-600 hover:bg-red-50 font-medium transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-4 text-sm">
              <span
                className={`px-2 py-0.5 font-medium ${
                  progress.status === "running"
                    ? "bg-green-100 text-green-700"
                    : progress.status === "paused"
                      ? "bg-amber-100 text-amber-700"
                      : progress.status === "completed"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-red-100 text-red-700"
                }`}
              >
                {progress.status.toUpperCase()}
              </span>

              <span className="text-harbour-600">
                {progress.fetchedProfiles} / {progress.totalUsers} profiles fetched (
                {progressPercent}%)
              </span>

              {progress.errorCount > 0 && (
                <span className="text-red-600">{progress.errorCount} errors</span>
              )}

              {isWorking && <span className="text-harbour-400 animate-pulse">Working...</span>}
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-harbour-200  overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  progress.status === "completed"
                    ? "bg-blue-500"
                    : progress.status === "error"
                      ? "bg-red-500"
                      : "bg-green-500"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Rate limit warning */}
            {progress.waitingForRateLimit && progress.rateLimitReset && (
              <div className="text-sm text-amber-600 bg-amber-50 p-2">
                Rate limited. Can resume at {new Date(progress.rateLimitReset).toLocaleTimeString()}
              </div>
            )}

            {/* Stale job warning */}
            {!progress.sourceUsername && (
              <div className="text-sm text-amber-700 bg-amber-50 p-2">
                This job lost its data (server restarted). Click "Reset" to start fresh.
              </div>
            )}

            {/* Error display */}
            {progress.lastError && (
              <div className="text-sm text-red-600 bg-red-50 p-2">{progress.lastError}</div>
            )}

            {/* Instruction for manual fetching */}
            {canContinue && (
              <div className="text-sm text-harbour-500 bg-harbour-100 p-2">
                Click "Fetch Next Batch" to fetch the next 10 profiles. Each click makes ~10 API
                calls.
              </div>
            )}
          </div>
        )}

        {/* Error list */}
        {progress.errors.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-red-600 hover:text-red-700">
              {progress.errors.length} errors
            </summary>
            <ul className="mt-2 list-disc list-inside text-red-600 bg-red-50 p-2">
              {progress.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </details>
        )}

        {/* Import results */}
        {fetcher.data?.intent === "import" && (
          <div className="flex flex-col gap-2">
            {fetcher.data.imported && fetcher.data.imported.length > 0 && (
              <div className="p-4 bg-green-50 border border-green-200 text-green-700">
                Successfully processed {fetcher.data.imported.length} users
                <ul className="list-disc list-inside mt-2 text-sm">
                  {fetcher.data.imported.slice(0, 10).map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                  {fetcher.data.imported.length > 10 && (
                    <li>...and {fetcher.data.imported.length - 10} more</li>
                  )}
                </ul>
              </div>
            )}
            {fetcher.data.errors && fetcher.data.errors.length > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-600">
                <p className="font-medium">Errors:</p>
                <ul className="list-disc list-inside mt-2">
                  {fetcher.data.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Fetched profiles list */}
        {progress.profiles.length > 0 && (
          <>
            {/* Location groups summary */}
            <div className="border border-harbour-200 p-4 bg-harbour-50">
              <h2 className="font-semibold text-harbour-700 mb-3">
                Locations ({locationGroups.length} unique)
              </h2>
              <div className="flex flex-wrap gap-2">
                {locationGroups.map(([location, users]) => (
                  <span
                    key={location}
                    className={`px-2 py-1 text-sm border ${
                      location === "(no location)"
                        ? "bg-grey-100 border-grey-300 text-grey-600"
                        : "bg-white border-harbour-200 text-harbour-700"
                    }`}
                  >
                    {location} ({users.length})
                  </span>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-harbour-500">{progress.profiles.length} profiles fetched</span>
              <button
                type="button"
                onClick={selectAll}
                className="text-sm text-harbour-600 hover:text-harbour-800 underline"
              >
                Select all new
              </button>
              <button
                type="button"
                onClick={selectNone}
                className="text-sm text-harbour-600 hover:text-harbour-800 underline"
              >
                Select none
              </button>
              <label className="flex items-center gap-2 text-sm ml-auto">
                <input
                  type="checkbox"
                  checked={downloadAvatars}
                  onChange={(e) => setDownloadAvatars(e.target.checked)}
                  className="border border-harbour-300"
                />
                Download avatars
              </label>
            </div>

            {/* Profiles list */}
            <div className="flex flex-col gap-2">
              {progress.profiles.map((user) => {
                const existing = isExisting(user);
                const displayName = user.name || user.login;

                return (
                  <div
                    key={user.login}
                    className={`flex items-center gap-4 p-3 border ${
                      existing
                        ? "bg-harbour-50 border-harbour-200 opacity-60"
                        : selected.has(user.login)
                          ? "bg-blue-50 border-blue-300"
                          : "bg-white border-harbour-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(user.login)}
                      onChange={() => toggleSelect(user.login)}
                      disabled={existing}
                      className="w-5 h-5"
                    />

                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt=""
                        className="w-10 h-10 object-cover  bg-harbour-100"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-harbour-100 " />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{displayName}</span>
                        <span className="text-sm text-harbour-400">@{user.login}</span>
                        {existing && (
                          <span className="text-xs px-2 py-0.5 bg-harbour-200 text-harbour-600">
                            Already imported
                          </span>
                        )}
                      </div>
                      {user.bio && <p className="text-sm text-harbour-500 truncate">{user.bio}</p>}
                      <div className="flex items-center gap-3 text-sm text-harbour-400 flex-wrap">
                        {user.company && <span className="text-harbour-600">{user.company}</span>}
                        {user.location && <span>{user.location}</span>}
                        {user.public_repos > 0 && <span>{user.public_repos} repos</span>}
                      </div>
                    </div>

                    <a
                      href={user.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-harbour-400 hover:text-harbour-600"
                    >
                      View
                    </a>
                  </div>
                );
              })}
            </div>

            {/* Bottom actions */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* Fetch more button */}
              {canContinue && (
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={isWorking}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors"
                >
                  {isWorking
                    ? "Fetching..."
                    : `Fetch Next Batch (${progress.fetchedProfiles}/${progress.totalUsers})`}
                </button>
              )}

              {/* Import button */}
              <button
                type="button"
                onClick={handleImport}
                disabled={selected.size === 0 || isImporting}
                className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
              >
                {isImporting ? "Importing..." : `Import ${selected.size} Selected Users`}
              </button>

              {selected.size > 0 && (
                <span className="text-sm text-harbour-500">{selected.size} users selected</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
