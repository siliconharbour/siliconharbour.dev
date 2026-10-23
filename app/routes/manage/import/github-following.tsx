import { jsonFromForm } from "~/lib/admin/import-form-adapters";
import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/github-following";
import { useFetcher, useLoaderData } from "react-router";
import { useState, useMemo } from "react";
import { requireAdmin } from "~/lib/session.server";

import type { GitHubUser, GitHubUserBasic } from "~/lib/github.types";

import { getAllPeople } from "~/lib/people.server";

import { ManagePage } from "~/components/manage/ManagePage";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from GitHub Connections - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  // Get existing people for duplicate detection
  const existingPeople = await getAllPeople(true);
  const existingGitHubs = new Set(
    existingPeople.filter((p) => p.github).map((p) => p.github!.toLowerCase()),
  );

  // Get current job progress - this is the source of truth
  const result = await runAdminOperation(request, operationCatalog.githubFollowingStatus, {});
  if (!result.ok) throw new Response(result.error, { status: 400 });
  const progress = result.data;

  return {
    existingGitHubs: Array.from(existingGitHubs),
    progress,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "import") {
    let users: unknown;
    try {
      users = jsonFromForm(form, "users");
    } catch (error) {
      return {
        intent: "import",
        imported: [],
        errors: [error instanceof Error ? error.message : "Invalid JSON"],
      } as const;
    }
    const result = await runAdminOperation(request, operationCatalog.githubFollowingImport, {
      users,
      downloadAvatars: form.get("downloadAvatars") === "true",
    });
    return result.ok
      ? ({ intent: "import", ...result.data } as const)
      : ({ intent: "import", imported: [], errors: [result.error] } as const);
  }
  const operations = {
    start: operationCatalog.githubFollowingStart,
    continue: operationCatalog.githubFollowingContinue,
    resume: operationCatalog.githubFollowingResume,
    pause: operationCatalog.githubFollowingPause,
    reset: operationCatalog.githubFollowingReset,
  };
  if (typeof intent !== "string" || !Object.hasOwn(operations, intent)) return null;
  const input =
    intent === "start"
      ? { username: form.get("username"), mode: form.get("mode") || "following", confirm: true }
      : intent === "pause"
        ? {}
        : { confirm: true };
  const result = await runAdminOperation(
    request,
    operations[intent as keyof typeof operations],
    input,
  );
  return result.ok
    ? ({ intent: intent as keyof typeof operations, progress: result.data, error: null } as const)
    : ({ intent: intent as keyof typeof operations, error: result.error } as const);
}

export default function ImportGitHubFollowing() {
  const { existingGitHubs, progress: loaderProgress } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<"following" | "followers" | "both">("following");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloadAvatars, setDownloadAvatars] = useState(true);

  // Progress comes from fetcher response (most recent) or loader (initial)
  const progress = fetcher.data?.progress ?? loaderProgress;

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
    <ManagePage
      title="Import from GitHub Connections"
      backTo="/manage"
      backLabel="Back to Dashboard"
      maxWidthClassName="max-w-6xl"
    >
      <p className="text-muted">
        Enter a GitHub username to fetch their following/followers and import them as people. Click
        "Fetch Next Batch" repeatedly to fetch profiles (10 at a time).
      </p>

      {/* Rate limit indicator */}
      {progress.rateLimitRemaining !== null && (
        <div className="text-sm text-subtle">
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
        <div className="flex items-center gap-gap-4 flex-wrap">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="GitHub username"
            className="px-pad-4 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none w-64"
            onKeyDown={(e) => {
              if (e.key === "Enter" && username.trim() && !isWorking) {
                handleStart();
              }
            }}
          />

          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "following" | "followers" | "both")}
            className="px-pad-4 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
          >
            <option value="following">Following (who they follow)</option>
            <option value="followers">Followers (who follows them)</option>
            <option value="both">Both (combined, deduplicated)</option>
          </select>

          <button
            type="button"
            onClick={handleStart}
            disabled={!username.trim() || isWorking}
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover disabled:bg-harbour-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {isWorking ? "Starting..." : "Fetch Users"}
          </button>
        </div>
      )}

      {/* Job in progress */}
      {progress.status !== "idle" && (
        <div className="border border-line p-pad-4 bg-soft flex flex-col gap-gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-heading">
              {progress.sourceUsername
                ? `@${progress.sourceUsername}'s ${progress.mode}`
                : "Stale job (server restarted?)"}
            </h2>

            <div className="flex items-center gap-gap-2">
              {canContinue && (
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={isWorking}
                  className="px-pad-3 py-pad-1-5 text-sm bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors"
                >
                  {isWorking ? "Fetching..." : "Fetch Next Batch"}
                </button>
              )}

              {progress.status === "running" && !canContinue && !isWorking && (
                <button
                  type="button"
                  onClick={handlePause}
                  className="px-pad-3 py-pad-1-5 text-sm bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
                >
                  Pause
                </button>
              )}

              {progress.status === "paused" && (
                <button
                  type="button"
                  onClick={handleResume}
                  disabled={isWorking}
                  className="px-pad-3 py-pad-1-5 text-sm bg-primary hover:bg-primary-hover disabled:bg-harbour-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
                >
                  Resume
                </button>
              )}

              {progress.status === "completed" && (
                <span className="px-pad-3 py-pad-1-5 text-sm bg-blue-100 text-blue-700 font-medium">
                  Complete!
                </span>
              )}

              <button
                type="button"
                onClick={handleReset}
                disabled={isWorking}
                className="px-pad-3 py-pad-1-5 text-sm border border-red-300 text-red-600 hover:bg-red-50 font-medium transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-gap-4 text-sm">
            <span
              className={`px-pad-2 py-pad-0-5 font-medium ${
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

            <span className="text-body">
              {progress.fetchedProfiles} / {progress.totalUsers} profiles fetched ({progressPercent}
              %)
            </span>

            {progress.errorCount > 0 && (
              <span className="text-red-600">{progress.errorCount} errors</span>
            )}

            {isWorking && <span className="text-subtle animate-pulse">Working...</span>}
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
            <div className="text-sm text-amber-600 bg-amber-50 p-pad-2">
              Rate limited. Can resume at {new Date(progress.rateLimitReset).toLocaleTimeString()}
            </div>
          )}

          {/* Stale job warning */}
          {!progress.sourceUsername && (
            <div className="text-sm text-amber-700 bg-amber-50 p-pad-2">
              This job lost its data (server restarted). Click "Reset" to start fresh.
            </div>
          )}

          {/* Error display */}
          {progress.lastError && (
            <div className="text-sm text-red-600 bg-red-50 p-pad-2">{progress.lastError}</div>
          )}

          {/* Instruction for manual fetching */}
          {canContinue && (
            <div className="text-sm text-muted bg-tint p-pad-2">
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
          <ul className="mt-2 list-disc list-inside text-red-600 bg-red-50 p-pad-2">
            {progress.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Import results */}
      {fetcher.data?.intent === "import" && (
        <div className="flex flex-col gap-gap-2">
          {fetcher.data.imported && fetcher.data.imported.length > 0 && (
            <div className="p-pad-4 bg-green-50 border border-green-200 text-green-700">
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
            <div className="p-pad-4 bg-red-50 border border-red-200 text-red-600">
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
          <div className="border border-line p-pad-4 bg-soft">
            <h2 className="font-semibold text-heading mb-3">
              Locations ({locationGroups.length} unique)
            </h2>
            <div className="flex flex-wrap gap-gap-2">
              {locationGroups.map(([location, users]) => (
                <span
                  key={location}
                  className={`px-pad-2 py-pad-1 text-sm border ${
                    location === "(no location)"
                      ? "bg-grey-100 border-grey-300 text-grey-600"
                      : "bg-surface border-line text-heading"
                  }`}
                >
                  {location} ({users.length})
                </span>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-gap-4 flex-wrap">
            <span className="text-muted">{progress.profiles.length} profiles fetched</span>
            <button
              type="button"
              onClick={selectAll}
              className="text-sm text-body hover:text-harbour-800 underline"
            >
              Select all new
            </button>
            <button
              type="button"
              onClick={selectNone}
              className="text-sm text-body hover:text-harbour-800 underline"
            >
              Select none
            </button>
            <label className="flex items-center gap-gap-2 text-sm ml-auto">
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
          <div className="flex flex-col gap-gap-2">
            {progress.profiles.map((user) => {
              const existing = isExisting(user);
              const displayName = user.name || user.login;

              return (
                <div
                  key={user.login}
                  className={`flex items-center gap-gap-4 p-pad-3 border ${
                    existing
                      ? "bg-soft border-line opacity-60"
                      : selected.has(user.login)
                        ? "bg-blue-50 border-blue-300"
                        : "bg-surface border-line"
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
                      className="w-10 h-10 object-cover "
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-tint " />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-gap-2 flex-wrap">
                      <span className="font-medium">{displayName}</span>
                      <span className="text-sm text-subtle">@{user.login}</span>
                      {existing && (
                        <span className="text-xs px-pad-2 py-pad-0-5 bg-harbour-200 text-body">
                          Already imported
                        </span>
                      )}
                    </div>
                    {user.bio && <p className="text-sm text-muted truncate">{user.bio}</p>}
                    <div className="flex items-center gap-gap-3 text-sm text-subtle flex-wrap">
                      {user.company && <span className="text-body">{user.company}</span>}
                      {user.location && <span>{user.location}</span>}
                      {user.public_repos > 0 && <span>{user.public_repos} repos</span>}
                    </div>
                  </div>

                  <a
                    href={user.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-subtle hover:text-body"
                  >
                    View
                  </a>
                </div>
              );
            })}
          </div>

          {/* Bottom actions */}
          <div className="flex items-center gap-gap-4 flex-wrap">
            {/* Fetch more button */}
            {canContinue && (
              <button
                type="button"
                onClick={handleContinue}
                disabled={isWorking}
                className="px-pad-4 py-pad-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors"
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
              className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover disabled:bg-harbour-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {isImporting ? "Importing..." : `Import ${selected.size} Selected Users`}
            </button>

            {selected.size > 0 && (
              <span className="text-sm text-muted">{selected.size} users selected</span>
            )}
          </div>
        </>
      )}
    </ManagePage>
  );
}
