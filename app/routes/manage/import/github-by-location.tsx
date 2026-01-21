import type { Route } from "./+types/github-by-location";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useState, useEffect } from "react";
import { requireAuth } from "~/lib/session.server";
import { 
  searchNewfoundlandUsers, 
  getUserProfiles, 
  fetchAvatar,
  type GitHubUser 
} from "~/lib/github.server";
import { createPerson, updatePerson, getAllPeople, getPersonByName, getPersonByGitHub, deletePerson } from "~/lib/people.server";
import { 
  findCompanyByFuzzyName, 
  parseGitHubCompanyField, 
  extractCompanyFromBio,
  updateCompany 
} from "~/lib/companies.server";
import { processAndSaveIconImageWithPadding } from "~/lib/images.server";
import {
  getImportProgress,
  startImport,
  processNextBatch,
  pauseImport,
  resetImport,
  type ImportProgress,
} from "~/lib/github-import.server";
import {
  getBlockedExternalIds,
  blockItem,
  unblockItem,
} from "~/lib/import-blocklist.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from GitHub - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  
  // Get existing people for duplicate detection
  const existingPeople = await getAllPeople(true); // include hidden
  const existingNames = new Set(existingPeople.map(p => p.name.toLowerCase()));
  const existingGitHubs = new Set(
    existingPeople
      .filter(p => p.github)
      .map(p => p.github!.toLowerCase())
  );
  
  // Get blocked GitHub URLs
  const blockedGitHubs = await getBlockedExternalIds("github");
  
  // Get bulk import progress
  const importProgress = await getImportProgress();
  
  return { 
    existingNames: Array.from(existingNames), 
    existingGitHubs: Array.from(existingGitHubs),
    blockedGitHubs: Array.from(blockedGitHubs),
    importProgress,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  
  const formData = await request.formData();
  const intent = formData.get("intent");
  
  // Bulk import actions
  if (intent === "bulk-start") {
    const progress = await startImport();
    return { intent: "bulk-start", progress, error: null };
  }
  
  if (intent === "bulk-continue") {
    const downloadAvatars = formData.get("downloadAvatars") !== "false";
    const result = await processNextBatch(downloadAvatars);
    return { 
      intent: "bulk-continue", 
      progress: result.progress, 
      processed: result.processed,
      errors: result.errors,
    };
  }
  
  if (intent === "bulk-pause") {
    const progress = await pauseImport();
    return { intent: "bulk-pause", progress, error: null };
  }
  
  if (intent === "bulk-reset") {
    const progress = await resetImport();
    return { intent: "bulk-reset", progress, error: null };
  }
  
  // Blocklist actions
  if (intent === "block") {
    const externalId = formData.get("externalId") as string;
    const name = formData.get("name") as string;
    const reason = formData.get("reason") as string | null;
    
    if (externalId && name) {
      // Add to blocklist
      await blockItem("github", externalId, name, reason || undefined);
      
      // Also delete existing person with this GitHub URL
      const existingPerson = await getPersonByGitHub(externalId);
      if (existingPerson) {
        await deletePerson(existingPerson.id);
      }
      
      return { intent: "block", blocked: { externalId, name } };
    }
    return { intent: "block", error: "Missing externalId or name" };
  }
  
  if (intent === "unblock") {
    const externalId = formData.get("externalId") as string;
    
    if (externalId) {
      await unblockItem("github", externalId);
      return { intent: "unblock", unblocked: externalId };
    }
    return { intent: "unblock", error: "Missing externalId" };
  }
  
  // Original manual search/import actions
  if (intent === "search") {
    const page = parseInt(formData.get("page") as string) || 1;
    
    try {
      const result = await searchNewfoundlandUsers(page, 30);
      
      // Fetch full profiles for the search results
      const usernames = result.users.map(u => u.login);
      const profiles = await getUserProfiles(usernames);
      
      return { 
        intent: "search", 
        users: profiles, 
        total: result.total,
        page,
        rateLimit: {
          remaining: result.rateLimit.remaining,
          limit: result.rateLimit.limit,
          reset: result.rateLimit.reset.toISOString(),
        },
        error: null 
      };
    } catch (e) {
      return { intent: "search", users: [], total: 0, page: 1, rateLimit: null, error: String(e) };
    }
  }
  
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
          
          // Download and save avatar if requested
          if (downloadAvatars && user.avatar_url) {
            const imageBuffer = await fetchAvatar(user.avatar_url);
            if (imageBuffer) {
              avatar = await processAndSaveIconImageWithPadding(imageBuffer);
            }
          }
          
          const githubUrl = user.html_url;
          const displayName = user.name || user.login;
          
          // Check if person already exists by GitHub URL or name
          const existingByGitHub = await getPersonByGitHub(githubUrl);
          const existingByName = await getPersonByName(displayName);
          const existing = existingByGitHub || existingByName;
          
          // Try to find company from GitHub company field or bio
          let companyName: string | null = null;
          let githubOrgUrl: string | null = null;
          let matchedCompany = null;
          
          // First check GitHub company field
          if (user.company) {
            const parsed = parseGitHubCompanyField(user.company);
            companyName = parsed.name;
            githubOrgUrl = parsed.githubOrg;
            matchedCompany = await findCompanyByFuzzyName(parsed.name);
          }
          
          // If no company from field, try to extract from bio
          if (!companyName && user.bio) {
            const bioCompany = extractCompanyFromBio(user.bio);
            if (bioCompany) {
              companyName = bioCompany;
              matchedCompany = await findCompanyByFuzzyName(bioCompany);
            }
          }
          
          // If we found a GitHub org and it matches a company, update the company's github field
          if (githubOrgUrl && matchedCompany && !matchedCompany.github) {
            await updateCompany(matchedCompany.id, { github: githubOrgUrl });
          }
          
          // Build the bio with company reference
          let bio = user.bio || "";
          const companyRefName = matchedCompany?.name || companyName;
          
          // Add "Works at [[Company]]" if we have a company and it's not already in the bio
          if (companyRefName && !bio.toLowerCase().includes(companyRefName.toLowerCase())) {
            const companyRef = `[[${companyRefName}]]`;
            if (bio) {
              bio = `${bio}\n\nWorks at ${companyRef}.`;
            } else {
              bio = `GitHub user from ${user.location || "Newfoundland & Labrador"}. Works at ${companyRef}.`;
            }
          } else if (!bio) {
            bio = `GitHub user from ${user.location || "Newfoundland & Labrador"}.`;
          }
          
          if (existing) {
            // Merge: update with GitHub data if not already linked
            if (!existing.github) {
              await updatePerson(existing.id, {
                github: githubUrl,
                // Only fill in missing data
                website: existing.website || user.blog || null,
                avatar: existing.avatar || avatar,
                // Update bio if the existing one is generic
                bio: existing.bio.startsWith("GitHub user from") ? bio : existing.bio,
              });
              imported.push(`${displayName} (merged${matchedCompany ? `, linked to ${matchedCompany.name}` : ""})`);
            } else {
              // Already has GitHub link, skip
              imported.push(`${displayName} (skipped - already linked)`);
            }
          } else {
            // Create new person (hidden by default - needs review)
            await createPerson({
              name: displayName,
              bio,
              website: user.blog || null,
              github: githubUrl,
              avatar,
              visible: false, // Imported users start hidden until reviewed
            });
            
            imported.push(`${displayName}${matchedCompany ? ` (linked to ${matchedCompany.name})` : ""}`);
          }
        } catch (e) {
          const name = user.name || user.login;
          errors.push(`${name}: ${String(e)}`);
        }
      }
      
      return { intent: "import", imported, errors };
    } catch (e) {
      return { intent: "import", imported: [], errors: [String(e)] };
    }
  }
  
  return null;
}

export default function ImportGitHub() {
  const { existingNames, existingGitHubs, blockedGitHubs: initialBlocked, importProgress: initialProgress } = useLoaderData<typeof loader>();
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
          setFetchedUsers(fetcherData.users);
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
        setRecentActivity(prev => [...fetcherData.processed!, ...prev].slice(0, 20));
      }
      if (fetcherData.errors?.length) {
        setRecentActivity(prev => [...fetcherData.errors!.map(e => `ERROR: ${e}`), ...prev].slice(0, 20));
      }
    }
    
    // Handle block/unblock responses
    if (fetcherData?.intent === "block" && fetcherData.blocked) {
      setBlockedGitHubs(prev => new Set([...prev, fetcherData.blocked.externalId.toLowerCase()]));
    }
    if (fetcherData?.intent === "unblock" && fetcherData.unblocked) {
      setBlockedGitHubs(prev => {
        const newSet = new Set(prev);
        newSet.delete(fetcherData.unblocked.toLowerCase());
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
          { method: "post" }
        );
      }, 500); // Small delay between batches
      return () => clearTimeout(timer);
    }
  }, [autoRun, bulkProgress.status, fetcher.state, fetcher, downloadAvatars]);
  
  // Auto-resume after rate limit
  useEffect(() => {
    if (autoRun && bulkProgress.waitingForRateLimit && bulkProgress.rateLimitReset) {
      const waitTime = bulkProgress.rateLimitReset.getTime() - Date.now() + 5000; // 5s buffer
      if (waitTime > 0 && waitTime < 3600000) { // Max 1 hour wait
        const timer = setTimeout(() => {
          fetcher.submit(
            { intent: "bulk-start" },
            { method: "post" }
          );
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
    return blockedGitHubs.has(user.html_url.toLowerCase());
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
    const selectable = fetchedUsers.filter(u => isExisting(u) !== "github" && !isUserBlocked(u));
    setSelected(new Set(selectable.map(u => u.login)));
  };
  
  const selectNone = () => {
    setSelected(new Set());
  };
  
  const handleSearch = (page: number = 1) => {
    fetcher.submit(
      { intent: "search", page: String(page) },
      { method: "post" }
    );
  };
  
  const handleImport = () => {
    const toImport = fetchedUsers.filter(u => selected.has(u.login));
    fetcher.submit(
      { 
        intent: "import", 
        users: JSON.stringify(toImport),
        downloadAvatars: String(downloadAvatars)
      },
      { method: "post" }
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
      { method: "post" }
    );
  };
  
  const handleUnblock = (user: GitHubUser) => {
    fetcher.submit(
      { intent: "unblock", externalId: user.html_url },
      { method: "post" }
    );
  };
  
  const isSearching = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "search";
  const isImporting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "import";
  const isBulkRunning = fetcher.state !== "idle" && 
    (fetcher.formData?.get("intent") === "bulk-start" || 
     fetcher.formData?.get("intent") === "bulk-continue");
  
  const totalPages = Math.ceil(totalUsers / 30);
  const rateLimit = fetcherData?.intent === "search" ? fetcherData.rateLimit : null;
  
  const progressPercent = bulkProgress.totalItems > 0 
    ? Math.round((bulkProgress.processedItems / bulkProgress.totalItems) * 100)
    : 0;
  
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to="/manage"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
        
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">Import from GitHub</h1>
        </div>
        
        <p className="text-harbour-500">
          Search for GitHub users in Newfoundland & Labrador and import them as people. 
          Use "Import All" for automatic bulk import with rate limit handling.
        </p>
        
        {/* Bulk Import Section */}
        <div className="border border-harbour-200 p-4 bg-harbour-50 flex flex-col gap-4">
          <h2 className="font-semibold text-harbour-700">Bulk Import (Recommended)</h2>
          
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={downloadAvatars}
                onChange={(e) => setDownloadAvatars(e.target.checked)}
                className="rounded"
              />
              Download avatars
            </label>
            
            {bulkProgress.status === "idle" && (
              <button
                type="button"
                onClick={handleBulkStart}
                disabled={isBulkRunning}
                className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
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
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleBulkStart}
                    disabled={isBulkRunning}
                    className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
                  >
                    {isBulkRunning ? "Resuming..." : "Resume"}
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={handleBulkReset}
                  className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 font-medium transition-colors"
                >
                  Reset
                </button>
              </>
            )}
            
            {bulkProgress.status === "completed" && (
              <button
                type="button"
                onClick={handleBulkReset}
                className="px-4 py-2 border border-harbour-300 text-harbour-600 hover:bg-harbour-100 font-medium transition-colors"
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
                  className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={handleBulkReset}
                  className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 font-medium transition-colors"
                >
                  Reset
                </button>
              </>
            )}
          </div>
          
          {/* Progress display */}
          {bulkProgress.status !== "idle" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-4 text-sm">
                <span className={`px-2 py-0.5 font-medium ${
                  bulkProgress.status === "running" ? "bg-green-100 text-green-700" :
                  bulkProgress.status === "paused" ? "bg-amber-100 text-amber-700" :
                  bulkProgress.status === "completed" ? "bg-blue-100 text-blue-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {bulkProgress.status.toUpperCase()}
                  {autoRun && bulkProgress.status === "running" && " (auto)"}
                </span>
                
                <span className="text-harbour-600">
                  {bulkProgress.processedItems} / {bulkProgress.totalItems} users
                  ({progressPercent}%)
                </span>
                
                {bulkProgress.rateLimitRemaining !== null && (
                  <span className="text-harbour-400">
                    API: {bulkProgress.rateLimitRemaining} remaining
                  </span>
                )}
              </div>
              
              {/* Progress bar */}
              <div className="h-2 bg-harbour-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    bulkProgress.status === "completed" ? "bg-blue-500" :
                    bulkProgress.status === "error" ? "bg-red-500" :
                    "bg-green-500"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              
              {/* Stats */}
              <div className="flex gap-4 text-xs text-harbour-500">
                <span>Imported: {bulkProgress.importedCount}</span>
                <span>Skipped: {bulkProgress.skippedCount}</span>
                <span>Errors: {bulkProgress.errorCount}</span>
                <span>Page: {bulkProgress.currentPage} / {bulkProgress.totalPages}</span>
              </div>
              
              {/* Rate limit warning */}
              {bulkProgress.waitingForRateLimit && bulkProgress.rateLimitReset && (
                <div className="text-sm text-amber-600 bg-amber-50 p-2">
                  Rate limited. {autoRun ? "Will auto-resume" : "Can resume"} at{" "}
                  {bulkProgress.rateLimitReset.toLocaleTimeString()}
                </div>
              )}
              
              {/* Error display */}
              {bulkProgress.lastError && bulkProgress.status === "error" && (
                <div className="text-sm text-red-600 bg-red-50 p-2">
                  {bulkProgress.lastError}
                </div>
              )}
              
              {/* Recent activity log */}
              {recentActivity.length > 0 && (
                <details className="text-xs" open={bulkProgress.status === "running"}>
                  <summary className="cursor-pointer text-harbour-500 hover:text-harbour-700">
                    Recent activity ({recentActivity.length})
                  </summary>
                  <div className="mt-1 max-h-32 overflow-y-auto bg-white border border-harbour-100 p-2 font-mono">
                    {recentActivity.map((item, i) => (
                      <div key={i} className={item.startsWith("ERROR:") ? "text-red-600" : "text-harbour-600"}>
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
        <div className="border-t border-harbour-200 pt-4">
          <h2 className="font-semibold text-harbour-700 mb-2">Manual Import</h2>
          <p className="text-sm text-harbour-400 mb-4">
            Or search and select individual users to import.
          </p>
        </div>
        
        {/* Rate limit info */}
        {rateLimit && (
          <div className="text-sm text-harbour-400">
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
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors self-start"
          >
            {isSearching ? "Searching..." : "Search GitHub Users in Newfoundland & Labrador"}
          </button>
        )}
        
        {/* Error display */}
        {fetcherData?.intent === "search" && fetcherData.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">
            {fetcherData.error}
          </div>
        )}
        
        {/* Import results */}
        {fetcherData?.intent === "import" && (
          <div className="flex flex-col gap-2">
            {fetcherData.imported && fetcherData.imported.length > 0 && (
              <div className="p-4 bg-green-50 border border-green-200 text-green-700">
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
              <div className="p-4 bg-red-50 border border-red-200 text-red-600">
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
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-harbour-500">
                Found {totalUsers} users (showing page {currentPage} of {totalPages})
              </span>
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
            </div>
            
            <div className="flex flex-col gap-2">
              {fetchedUsers.map((user) => {
                const existingStatus = isExisting(user);
                const blocked = isUserBlocked(user);
                const displayName = user.name || user.login;
                return (
                  <div
                    key={user.login}
                    className={`flex items-center gap-4 p-3 border ${
                      blocked
                        ? "bg-red-50 border-red-200 opacity-50"
                        : existingStatus === "github"
                        ? "bg-harbour-50 border-harbour-200 opacity-60" 
                        : selected.has(user.login)
                        ? "bg-blue-50 border-blue-300"
                        : existingStatus === "name"
                        ? "bg-amber-50 border-amber-200"
                        : "bg-white border-harbour-200"
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
                        className={`w-10 h-10 object-cover rounded-full bg-harbour-100 ${blocked ? "grayscale" : ""}`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-harbour-100 rounded-full" />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${blocked ? "line-through text-harbour-400" : ""}`}>{displayName}</span>
                        <span className="text-sm text-harbour-400">@{user.login}</span>
                        {blocked && (
                          <span className="text-xs px-2 py-0.5 bg-red-200 text-red-700">
                            Import blocked
                          </span>
                        )}
                        {!blocked && existingStatus === "github" && (
                          <span className="text-xs px-2 py-0.5 bg-harbour-200 text-harbour-600">
                            Already imported
                          </span>
                        )}
                        {!blocked && existingStatus === "name" && (
                          <span className="text-xs px-2 py-0.5 bg-amber-200 text-amber-700">
                            Will merge
                          </span>
                        )}
                      </div>
                      {user.bio && (
                        <p className="text-sm text-harbour-500 truncate">
                          {user.bio}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-sm text-harbour-400 flex-wrap">
                        {user.company && (
                          <span className="text-harbour-600">{user.company}</span>
                        )}
                        {user.location && <span>{user.location}</span>}
                        {user.public_repos > 0 && <span>{user.public_repos} repos</span>}
                        {user.blog && (
                          <a
                            href={user.blog.startsWith("http") ? user.blog : `https://${user.blog}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-harbour-600 truncate"
                          >
                            {user.blog}
                          </a>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <a
                        href={user.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-harbour-400 hover:text-harbour-600"
                      >
                        View
                      </a>
                      {blocked ? (
                        <button
                          type="button"
                          onClick={() => handleUnblock(user)}
                          className="text-xs px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                        >
                          Remove block
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBlock(user)}
                          className="text-xs px-2 py-1 text-harbour-500 hover:bg-harbour-100 transition-colors"
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSearch(currentPage - 1)}
                  disabled={currentPage <= 1 || isSearching}
                  className="px-3 py-1.5 text-sm border border-harbour-300 hover:bg-harbour-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-harbour-500">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => handleSearch(currentPage + 1)}
                  disabled={currentPage >= totalPages || isSearching}
                  className="px-3 py-1.5 text-sm border border-harbour-300 hover:bg-harbour-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleImport}
                disabled={selected.size === 0 || isImporting}
                className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
              >
                {isImporting 
                  ? "Importing..." 
                  : `Import ${selected.size} Selected Users`
                }
              </button>
              
              {selected.size > 0 && (
                <span className="text-sm text-harbour-500">
                  {selected.size} users selected
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
