import { normalizeBlockKey } from "~/lib/import-blocklist-key";
import type { z } from "zod";
import type { githubProgressOutput } from "~/operations/contracts/importers";
type ImportProgress = z.output<typeof githubProgressOutput>;
import { jsonFromForm } from "~/lib/admin/import-form-adapters";
import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/github-by-location";
import { useFetcher, useLoaderData } from "react-router";
import { useState, useEffect } from "react";
import { requireAdmin } from "~/lib/session.server";

import type { GitHubUser } from "~/lib/github.types";
import { getAllPeople } from "~/lib/people.server";

import { getBlockedExternalIds } from "~/lib/import-blocklist.server";
import { ManagePage } from "~/components/manage/ManagePage";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from GitHub - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  // Get existing people for duplicate detection
  const existingPeople = await getAllPeople(true); // include hidden
  const existingNames = new Set(existingPeople.map((p) => p.name.toLowerCase()));
  const existingGitHubs = new Set(
    existingPeople.filter((p) => p.github).map((p) => p.github!.toLowerCase()),
  );

  // Get blocked GitHub URLs
  const blockedGitHubs = await getBlockedExternalIds("github");

  // Get bulk import progress
  const result = await runAdminOperation(request, operationCatalog.githubLocationBulkStatus, {});
  if (!result.ok) throw new Response(result.error, { status: 400 });
  const importProgress = result.data;

  return {
    existingNames: Array.from(existingNames),
    existingGitHubs: Array.from(existingGitHubs),
    blockedGitHubs: Array.from(blockedGitHubs),
    importProgress,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "search") {
    const result = await runAdminOperation(request, operationCatalog.githubLocationSearch, {
      page: Number(form.get("page") || 1),
      confirm: true,
    });
    return result.ok
      ? ({ intent: "search", ...result.data, error: null } as const)
      : ({
          intent: "search",
          users: [],
          total: 0,
          page: 1,
          rateLimit: null,
          error: result.error,
        } as const);
  }
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
    const result = await runAdminOperation(request, operationCatalog.githubLocationImport, {
      users,
      downloadAvatars: form.get("downloadAvatars") === "true",
    });
    return result.ok
      ? ({ intent: "import", ...result.data } as const)
      : ({ intent: "import", imported: [], errors: [result.error] } as const);
  }
  if (intent === "block") {
    const result = await runAdminOperation(request, operationCatalog.blocklistAdd, {
      source: "github",
      externalId: form.get("externalId"),
      name: form.get("name"),
      reason: form.get("reason") ?? null,
      deleteExisting: true,
      confirm: true,
    });
    return result.ok
      ? ({
          intent: "block",
          blocked: { externalId: result.data.key, name: String(form.get("name")) },
        } as const)
      : ({ intent: "block", error: result.error } as const);
  }
  if (intent === "unblock") {
    const result = await runAdminOperation(request, operationCatalog.blocklistRemove, {
      source: "github",
      externalId: form.get("externalId"),
    });
    return result.ok
      ? ({ intent: "unblock", unblocked: result.data.key } as const)
      : ({ intent: "unblock", error: result.error } as const);
  }
  if (intent === "bulk-continue") {
    const result = await runAdminOperation(request, operationCatalog.githubLocationBulkContinue, {
      downloadAvatars: form.get("downloadAvatars") !== "false",
      confirm: true,
    });
    return result.ok
      ? ({ intent: "bulk-continue", ...result.data } as const)
      : ({
          intent: "bulk-continue",
          error: result.error,
          processed: [],
          errors: [result.error],
        } as const);
  }
  const operations = {
    "bulk-start": operationCatalog.githubLocationBulkStart,
    "bulk-pause": operationCatalog.githubLocationBulkPause,
    "bulk-reset": operationCatalog.githubLocationBulkReset,
  };
  if (typeof intent !== "string" || !Object.hasOwn(operations, intent)) return null;
  const result = await runAdminOperation(
    request,
    operations[intent as keyof typeof operations],
    intent === "bulk-pause" ? {} : { confirm: true },
  );
  return result.ok
    ? ({ intent: intent as keyof typeof operations, progress: result.data, error: null } as const)
    : ({ intent: intent as keyof typeof operations, error: result.error } as const);
}

export default function ImportGitHub() {
  const {
    existingNames,
    existingGitHubs,
    blockedGitHubs: initialBlocked,
    importProgress: initialProgress,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [fetchedUsers, setFetchedUsers] = useState<GitHubUser[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloadAvatars, setDownloadAvatars] = useState(true);
  const [bulkProgress, setBulkProgress] = useState<ImportProgress>(initialProgress);
  const [autoRun, setAutoRun] = useState(false);
  const [recentActivity, setRecentActivity] = useState<string[]>([]);
  const [blockedGitHubs, setBlockedGitHubs] = useState<Set<string>>(new Set(initialBlocked));

  // Handle fetcher response
  const fetcherData = fetcher.data;

  useEffect(() => {
    if (fetcherData?.intent === "search" && fetcherData.users) {
      if (fetchedUsers.length === 0 || fetcherData.page !== currentPage) {
        if (fetcherData.users.length > 0) {
          setFetchedUsers([...fetcherData.users]);
          setTotalUsers(fetcherData.total);
          setCurrentPage(fetcherData.page);
        }
      }
    }

    // Update bulk progress from fetcher
    if (fetcherData?.progress) {
      setBulkProgress(fetcherData.progress);
    }

    // Add recent activity
    if (fetcherData?.intent === "bulk-continue") {
      if (fetcherData.processed?.length) {
        setRecentActivity((prev) => [...fetcherData.processed!, ...prev].slice(0, 20));
      }
      if (fetcherData.errors?.length) {
        setRecentActivity((prev) =>
          [...fetcherData.errors!.map((e) => `ERROR: ${e}`), ...prev].slice(0, 20),
        );
      }
    }

    // Handle block/unblock responses
    if (fetcherData?.intent === "block" && fetcherData.blocked) {
      setBlockedGitHubs(
        (prev) => new Set([...prev, normalizeBlockKey("github", fetcherData.blocked.externalId)]),
      );
    }
    if (fetcherData?.intent === "unblock" && fetcherData.unblocked) {
      setBlockedGitHubs((prev) => {
        const newSet = new Set(prev);
        newSet.delete(normalizeBlockKey("github", fetcherData.unblocked));
        return newSet;
      });
    }
  }, [fetcherData, currentPage, fetchedUsers.length]);

  // Auto-continue when running and not rate limited
  useEffect(() => {
    if (autoRun && bulkProgress.status === "running" && fetcher.state === "idle") {
      const timer = setTimeout(() => {
        fetcher.submit(
          { intent: "bulk-continue", downloadAvatars: String(downloadAvatars) },
          { method: "post" },
        );
      }, 500); // Small delay between batches
      return () => clearTimeout(timer);
    }
  }, [autoRun, bulkProgress.status, fetcher.state, fetcher, downloadAvatars]);

  // Auto-resume after rate limit
  useEffect(() => {
    if (autoRun && bulkProgress.waitingForRateLimit && bulkProgress.rateLimitReset) {
      const waitTime = new Date(bulkProgress.rateLimitReset).getTime() - Date.now() + 5000; // 5s buffer
      if (waitTime > 0 && waitTime < 3600000) {
        // Max 1 hour wait
        const timer = setTimeout(() => {
          fetcher.submit({ intent: "bulk-start" }, { method: "post" });
        }, waitTime);
        return () => clearTimeout(timer);
      }
    }
  }, [autoRun, bulkProgress.waitingForRateLimit, bulkProgress.rateLimitReset, fetcher]);

  const isExisting = (user: GitHubUser) => {
    const githubUrl = user.html_url.toLowerCase();
    if (existingGitHubs.includes(githubUrl)) return "github";
    const name = (user.name || user.login).toLowerCase();
    if (existingNames.includes(name)) return "name";
    return false;
  };

  const isUserBlocked = (user: GitHubUser) => {
    return blockedGitHubs.has(normalizeBlockKey("github", user.html_url));
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
    const selectable = fetchedUsers.filter((u) => isExisting(u) !== "github" && !isUserBlocked(u));
    setSelected(new Set(selectable.map((u) => u.login)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handleSearch = (page: number = 1) => {
    fetcher.submit({ intent: "search", page: String(page) }, { method: "post" });
  };

  const handleImport = () => {
    const toImport = fetchedUsers.filter((u) => selected.has(u.login));
    fetcher.submit(
      {
        intent: "import",
        users: JSON.stringify(toImport),
        downloadAvatars: String(downloadAvatars),
      },
      { method: "post" },
    );
  };

  const handleBulkStart = () => {
    setAutoRun(true);
    fetcher.submit({ intent: "bulk-start" }, { method: "post" });
  };

  const handleBulkPause = () => {
    setAutoRun(false);
    fetcher.submit({ intent: "bulk-pause" }, { method: "post" });
  };

  const handleBulkReset = () => {
    setAutoRun(false);
    setRecentActivity([]);
    fetcher.submit({ intent: "bulk-reset" }, { method: "post" });
  };

  const handleBlock = (user: GitHubUser) => {
    const displayName = user.name || user.login;
    fetcher.submit(
      { intent: "block", externalId: user.html_url, name: displayName },
      { method: "post" },
    );
  };

  const handleUnblock = (user: GitHubUser) => {
    fetcher.submit({ intent: "unblock", externalId: user.html_url }, { method: "post" });
  };

  const isSearching = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "search";
  const isImporting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "import";
  const isBulkRunning =
    fetcher.state !== "idle" &&
    (fetcher.formData?.get("intent") === "bulk-start" ||
      fetcher.formData?.get("intent") === "bulk-continue");

  const totalPages = Math.ceil(totalUsers / 30);
  const rateLimit = fetcherData?.intent === "search" ? fetcherData.rateLimit : null;

  const progressPercent =
    bulkProgress.totalItems > 0
      ? Math.round((bulkProgress.processedItems / bulkProgress.totalItems) * 100)
      : 0;

  return (
    <ManagePage
      title="Import from GitHub"
      backTo="/manage"
      backLabel="Back to Dashboard"
      maxWidthClassName="max-w-6xl"
    >
      <p className="text-muted">
        Search for GitHub users in Newfoundland & Labrador and import them as people. Use "Import
        All" for automatic bulk import with rate limit handling.
      </p>

      {/* Bulk Import Section */}
      <div className="border border-line p-pad-4 bg-soft flex flex-col gap-gap-4">
        <h2 className="font-semibold text-heading">Bulk Import (Recommended)</h2>

        <div className="flex items-center gap-gap-4 flex-wrap">
          <label className="flex items-center gap-gap-2 text-sm">
            <input
              type="checkbox"
              checked={downloadAvatars}
              onChange={(e) => setDownloadAvatars(e.target.checked)}
              className="border border-harbour-300"
            />
            Download avatars
          </label>

          {bulkProgress.status === "idle" && (
            <button
              type="button"
              onClick={handleBulkStart}
              disabled={isBulkRunning}
              className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover disabled:bg-harbour-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {isBulkRunning ? "Starting..." : "Import All Users"}
            </button>
          )}

          {(bulkProgress.status === "running" || bulkProgress.status === "paused") && (
            <>
              {bulkProgress.status === "running" || autoRun ? (
                <button
                  type="button"
                  onClick={handleBulkPause}
                  className="px-pad-4 py-pad-2 bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleBulkStart}
                  disabled={isBulkRunning}
                  className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover disabled:bg-harbour-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
                >
                  {isBulkRunning ? "Resuming..." : "Resume"}
                </button>
              )}

              <button
                type="button"
                onClick={handleBulkReset}
                className="px-pad-4 py-pad-2 border border-red-300 text-red-600 hover:bg-red-50 font-medium transition-colors"
              >
                Reset
              </button>
            </>
          )}

          {bulkProgress.status === "completed" && (
            <button
              type="button"
              onClick={handleBulkReset}
              className="px-pad-4 py-pad-2 border border-harbour-300 text-body hover:bg-tint font-medium transition-colors"
            >
              Start New Import
            </button>
          )}

          {bulkProgress.status === "error" && (
            <>
              <button
                type="button"
                onClick={handleBulkStart}
                disabled={isBulkRunning}
                className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover disabled:bg-harbour-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={handleBulkReset}
                className="px-pad-4 py-pad-2 border border-red-300 text-red-600 hover:bg-red-50 font-medium transition-colors"
              >
                Reset
              </button>
            </>
          )}
        </div>

        {/* Progress display */}
        {bulkProgress.status !== "idle" && (
          <div className="flex flex-col gap-gap-2">
            <div className="flex items-center gap-gap-4 text-sm">
              <span
                className={`px-pad-2 py-pad-0-5 font-medium ${
                  bulkProgress.status === "running"
                    ? "bg-green-100 text-green-700"
                    : bulkProgress.status === "paused"
                      ? "bg-amber-100 text-amber-700"
                      : bulkProgress.status === "completed"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-red-100 text-red-700"
                }`}
              >
                {bulkProgress.status.toUpperCase()}
                {autoRun && bulkProgress.status === "running" && " (auto)"}
              </span>

              <span className="text-body">
                {bulkProgress.processedItems} / {bulkProgress.totalItems} users ({progressPercent}
                %)
              </span>

              {bulkProgress.rateLimitRemaining !== null && (
                <span className="text-subtle">
                  API: {bulkProgress.rateLimitRemaining} remaining
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-harbour-200  overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  bulkProgress.status === "completed"
                    ? "bg-blue-500"
                    : bulkProgress.status === "error"
                      ? "bg-red-500"
                      : "bg-green-500"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Stats */}
            <div className="flex gap-gap-4 text-xs text-muted">
              <span>Imported: {bulkProgress.importedCount}</span>
              <span>Skipped: {bulkProgress.skippedCount}</span>
              <span>Errors: {bulkProgress.errorCount}</span>
              <span>
                Page: {bulkProgress.currentPage} / {bulkProgress.totalPages}
              </span>
            </div>

            {/* Rate limit warning */}
            {bulkProgress.waitingForRateLimit && bulkProgress.rateLimitReset && (
              <div className="text-sm text-amber-600 bg-amber-50 p-pad-2">
                Rate limited. {autoRun ? "Will auto-resume" : "Can resume"} at{" "}
                {new Date(bulkProgress.rateLimitReset).toLocaleTimeString()}
              </div>
            )}

            {/* Error display */}
            {bulkProgress.lastError && bulkProgress.status === "error" && (
              <div className="text-sm text-red-600 bg-red-50 p-pad-2">{bulkProgress.lastError}</div>
            )}

            {/* Recent activity log */}
            {recentActivity.length > 0 && (
              <details className="text-xs" open={bulkProgress.status === "running"}>
                <summary className="cursor-pointer text-muted hover:text-heading">
                  Recent activity ({recentActivity.length})
                </summary>
                <div className="mt-1 max-h-32 overflow-y-auto bg-surface border border-harbour-100 p-pad-2 font-mono rounded-panel">
                  {recentActivity.map((item, i) => (
                    <div
                      key={i}
                      className={item.startsWith("ERROR:") ? "text-red-600" : "text-body"}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-line pt-pad-4">
        <h2 className="font-semibold text-heading mb-2">Manual Import</h2>
        <p className="text-sm text-subtle mb-4">Or search and select individual users to import.</p>
      </div>

      {/* Rate limit info */}
      {rateLimit && (
        <div className="text-sm text-subtle">
          API Rate Limit: {rateLimit.remaining}/{rateLimit.limit} remaining
          {rateLimit.remaining < 10 && (
            <span className="text-amber-600 ml-2">
              (Resets at {new Date(rateLimit.reset).toLocaleTimeString()})
            </span>
          )}
        </div>
      )}

      {/* Search button */}
      {fetchedUsers.length === 0 && (
        <button
          type="button"
          onClick={() => handleSearch(1)}
          disabled={isSearching}
          className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover disabled:bg-harbour-300 disabled:cursor-not-allowed text-white font-medium transition-colors self-start"
        >
          {isSearching ? "Searching..." : "Search GitHub Users in Newfoundland & Labrador"}
        </button>
      )}

      {/* Error display */}
      {fetcherData?.intent === "search" && fetcherData.error && (
        <div className="p-pad-4 bg-red-50 border border-red-200 text-red-600">
          {fetcherData.error}
        </div>
      )}

      {/* Import results */}
      {fetcherData?.intent === "import" && (
        <div className="flex flex-col gap-gap-2">
          {fetcherData.imported && fetcherData.imported.length > 0 && (
            <div className="p-pad-4 bg-green-50 border border-green-200 text-green-700">
              Successfully processed {fetcherData.imported.length} users
              <ul className="list-disc list-inside mt-2 text-sm">
                {fetcherData.imported.slice(0, 10).map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
                {fetcherData.imported.length > 10 && (
                  <li>...and {fetcherData.imported.length - 10} more</li>
                )}
              </ul>
            </div>
          )}
          {fetcherData.errors && fetcherData.errors.length > 0 && (
            <div className="p-pad-4 bg-red-50 border border-red-200 text-red-600">
              <p className="font-medium">Errors:</p>
              <ul className="list-disc list-inside mt-2">
                {fetcherData.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Users list */}
      {fetchedUsers.length > 0 && (
        <>
          <div className="flex items-center gap-gap-4 flex-wrap">
            <span className="text-muted">
              Found {totalUsers} users (showing page {currentPage} of {totalPages})
            </span>
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
          </div>

          <div className="flex flex-col gap-gap-2">
            {fetchedUsers.map((user) => {
              const existingStatus = isExisting(user);
              const blocked = isUserBlocked(user);
              const displayName = user.name || user.login;
              return (
                <div
                  key={user.login}
                  className={`flex items-center gap-gap-4 p-pad-3 border ${
                    blocked
                      ? "bg-red-50 border-red-200 opacity-50"
                      : existingStatus === "github"
                        ? "bg-soft border-line opacity-60"
                        : selected.has(user.login)
                          ? "bg-blue-50 border-blue-300"
                          : existingStatus === "name"
                            ? "bg-amber-50 border-amber-200"
                            : "bg-surface border-line"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(user.login)}
                    onChange={() => toggleSelect(user.login)}
                    disabled={existingStatus === "github" || blocked}
                    className="w-5 h-5"
                  />

                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className={`w-10 h-10 object-cover  ${blocked ? "grayscale" : ""}`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-tint " />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-gap-2 flex-wrap">
                      <span className={`font-medium ${blocked ? "line-through text-subtle" : ""}`}>
                        {displayName}
                      </span>
                      <span className="text-sm text-subtle">@{user.login}</span>
                      {blocked && (
                        <span className="text-xs px-pad-2 py-pad-0-5 bg-red-200 text-red-700">
                          Import blocked
                        </span>
                      )}
                      {!blocked && existingStatus === "github" && (
                        <span className="text-xs px-pad-2 py-pad-0-5 bg-harbour-200 text-body">
                          Already imported
                        </span>
                      )}
                      {!blocked && existingStatus === "name" && (
                        <span className="text-xs px-pad-2 py-pad-0-5 bg-amber-200 text-amber-700">
                          Will merge
                        </span>
                      )}
                    </div>
                    {user.bio && <p className="text-sm text-muted truncate">{user.bio}</p>}
                    <div className="flex items-center gap-gap-3 text-sm text-subtle flex-wrap">
                      {user.company && <span className="text-body">{user.company}</span>}
                      {user.location && <span>{user.location}</span>}
                      {user.public_repos > 0 && <span>{user.public_repos} repos</span>}
                      {user.blog && (
                        <a
                          href={user.blog.startsWith("http") ? user.blog : `https://${user.blog}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-body truncate"
                        >
                          {user.blog}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-gap-2">
                    <a
                      href={user.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-subtle hover:text-body"
                    >
                      View
                    </a>
                    {blocked ? (
                      <button
                        type="button"
                        onClick={() => handleUnblock(user)}
                        className="text-xs px-pad-2 py-pad-1 bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                      >
                        Remove block
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBlock(user)}
                        className="text-xs px-pad-2 py-pad-1 text-muted hover:bg-tint transition-colors"
                      >
                        Import block
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-gap-2">
              <button
                type="button"
                onClick={() => handleSearch(currentPage - 1)}
                disabled={currentPage <= 1 || isSearching}
                className="px-pad-3 py-pad-1-5 text-sm border border-harbour-300 hover:bg-soft disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-muted">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => handleSearch(currentPage + 1)}
                disabled={currentPage >= totalPages || isSearching}
                className="px-pad-3 py-pad-1-5 text-sm border border-harbour-300 hover:bg-soft disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}

          <div className="flex items-center gap-gap-4">
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
