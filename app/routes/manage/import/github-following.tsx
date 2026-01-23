import type { Route } from "./+types/github-following";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { requireAuth } from "~/lib/session.server";
import { 
  getAllUserFollowing,
  getAllUserFollowers,
  getUserProfile,
  fetchAvatar,
  getRateLimitStatus,
  type GitHubUser,
  type GitHubUserBasic,
} from "~/lib/github.server";
import { createPerson, getAllPeople, getPersonByName, getPersonByGitHub } from "~/lib/people.server";
import { 
  findCompanyByFuzzyName, 
  parseGitHubCompanyField, 
  extractCompanyFromBio,
  updateCompany 
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
    existingPeople
      .filter(p => p.github)
      .map(p => p.github!.toLowerCase())
  );
  
  // Get current rate limit status
  const rateLimit = await getRateLimitStatus();
  
  return { 
    existingGitHubs: Array.from(existingGitHubs),
    initialRateLimit: {
      remaining: rateLimit.remaining,
      limit: rateLimit.limit,
      reset: rateLimit.reset.toISOString(),
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  
  const formData = await request.formData();
  const intent = formData.get("intent");
  
  // Step 1: Get list of users (following, followers, or both)
  // This is cheap - just returns basic user info (login, avatar, etc.)
  if (intent === "fetch-user-list") {
    const username = (formData.get("username") as string)?.trim();
    const mode = formData.get("mode") as string || "following";
    
    if (!username) {
      return { intent, error: "Username is required", users: [], rateLimit: null };
    }
    
    try {
      let allUsers: GitHubUserBasic[] = [];
      let rateLimit = { remaining: 0, limit: 0, reset: new Date() };
      
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
      
      return { 
        intent, 
        users: allUsers,
        total: allUsers.length,
        rateLimit: {
          remaining: rateLimit.remaining,
          limit: rateLimit.limit,
          reset: rateLimit.reset.toISOString(),
        },
        error: null 
      };
    } catch (e) {
      return { intent, users: [], total: 0, rateLimit: null, error: String(e) };
    }
  }
  
  // Step 2: Fetch full profiles in batches
  // This is expensive - each user requires an API call
  // Octokit's throttling plugin handles rate limits automatically
  if (intent === "fetch-profiles-batch") {
    const usernamesJson = formData.get("usernames") as string;
    const batchSize = parseInt(formData.get("batchSize") as string) || 10;
    
    try {
      const usernames: string[] = JSON.parse(usernamesJson);
      const profiles: GitHubUser[] = [];
      const skipped: string[] = [];
      
      for (const username of usernames) {
        try {
          const profile = await getUserProfile(username);
          profiles.push(profile);
        } catch (e) {
          console.error(`Failed to fetch profile for ${username}:`, e);
          skipped.push(username);
          // Continue with next user - don't let one failure stop the batch
        }
      }
      
      // Get current rate limit status after batch
      const rateLimit = await getRateLimitStatus();
      
      return { 
        intent, 
        profiles,
        skipped,
        batchSize,
        rateLimit: {
          remaining: rateLimit.remaining,
          limit: rateLimit.limit,
          reset: rateLimit.reset.toISOString(),
        },
        error: null 
      };
    } catch (e) {
      return { intent, profiles: [], skipped: [], batchSize: 10, rateLimit: null, error: String(e) };
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
          
          imported.push(`${displayName}${matchedCompany ? ` (linked to ${matchedCompany.name})` : ""}`);
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
  const { existingGitHubs, initialRateLimit } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  
  const [username, setUsername] = useState("");
  const [fetchedUsers, setFetchedUsers] = useState<GitHubUserBasic[]>([]);
  const [fetchedProfiles, setFetchedProfiles] = useState<Map<string, GitHubUser>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloadAvatars, setDownloadAvatars] = useState(true);
  const [mode, setMode] = useState<"following" | "followers" | "both">("following");
  const [currentRateLimit, setCurrentRateLimit] = useState(initialRateLimit);
  
  // Progress state
  const [fetchProgress, setFetchProgress] = useState<{
    status: "idle" | "fetching-list" | "fetching-profiles" | "done" | "error";
    total: number;
    fetched: number;
    skipped: number;
    message: string;
  }>({ status: "idle", total: 0, fetched: 0, skipped: 0, message: "" });
  
  const pendingUsernames = useRef<string[]>([]);
  const skippedCount = useRef<number>(0);
  const totalToFetch = useRef<number>(0);
  
  const fetcherData = fetcher.data;
  
  // Handle the multi-step fetch process
  useEffect(() => {
    // Step 1 complete: Got list of users (basic info only)
    if (fetcherData?.intent === "fetch-user-list") {
      if (fetcherData.error) {
        setFetchProgress({ status: "error", total: 0, fetched: 0, skipped: 0, message: fetcherData.error });
        return;
      }
      
      if (fetcherData.rateLimit) {
        setCurrentRateLimit(fetcherData.rateLimit);
      }
      
      if (fetcherData.users && fetcherData.users.length > 0) {
        // Store the basic user list
        setFetchedUsers(fetcherData.users);
        setFetchedProfiles(new Map());
        
        // Start fetching full profiles in batches
        pendingUsernames.current = fetcherData.users.map((u: GitHubUserBasic) => u.login);
        skippedCount.current = 0;
        totalToFetch.current = fetcherData.users.length;
        
        setFetchProgress({
          status: "fetching-profiles",
          total: fetcherData.users.length,
          fetched: 0,
          skipped: 0,
          message: `Fetching full profiles: 0 / ${fetcherData.users.length}`,
        });
        
        // Fetch first batch - smaller batches to be more responsive
        const batchSize = 5;
        const batch = pendingUsernames.current.slice(0, batchSize);
        pendingUsernames.current = pendingUsernames.current.slice(batchSize);
        
        fetcher.submit(
          { intent: "fetch-profiles-batch", usernames: JSON.stringify(batch), batchSize: String(batchSize) },
          { method: "post" }
        );
      } else {
        setFetchProgress({ status: "done", total: 0, fetched: 0, skipped: 0, message: "No users found" });
      }
    }
    
    // Step 2: Profile batch complete
    if (fetcherData?.intent === "fetch-profiles-batch") {
      if (fetcherData.rateLimit) {
        setCurrentRateLimit(fetcherData.rateLimit);
      }
      
      if (fetcherData.profiles !== undefined) {
        // Add new profiles to the map
        setFetchedProfiles(prev => {
          const newMap = new Map(prev);
          for (const profile of fetcherData.profiles as GitHubUser[]) {
            newMap.set(profile.login, profile);
          }
          return newMap;
        });
        
        skippedCount.current += (fetcherData.skipped?.length || 0);
        
        const fetched = fetchedProfiles.size + (fetcherData.profiles as GitHubUser[]).length;
        const processed = fetched + skippedCount.current;
        const remaining = pendingUsernames.current.length;
        
        if (remaining > 0) {
          // Fetch next batch
          setFetchProgress({
            status: "fetching-profiles",
            total: totalToFetch.current,
            fetched,
            skipped: skippedCount.current,
            message: `Fetching full profiles: ${processed} / ${totalToFetch.current}${skippedCount.current > 0 ? ` (${skippedCount.current} skipped)` : ""}`,
          });
          
          const batchSize = 5;
          const batch = pendingUsernames.current.slice(0, batchSize);
          pendingUsernames.current = pendingUsernames.current.slice(batchSize);
          
          fetcher.submit(
            { intent: "fetch-profiles-batch", usernames: JSON.stringify(batch), batchSize: String(batchSize) },
            { method: "post" }
          );
        } else {
          // All done!
          setFetchProgress({
            status: "done",
            total: totalToFetch.current,
            fetched,
            skipped: skippedCount.current,
            message: `Fetched ${fetched} profiles${skippedCount.current > 0 ? ` (${skippedCount.current} skipped)` : ""}`,
          });
          
          // Auto-select users that aren't already imported and have profiles
          setSelected(prev => {
            const newSelected = new Set<string>();
            for (const user of fetchedUsers) {
              if (!existingGitHubs.includes(user.html_url.toLowerCase())) {
                newSelected.add(user.login);
              }
            }
            return newSelected;
          });
        }
      }
    }
  }, [fetcherData, existingGitHubs, fetcher, fetchedProfiles.size, fetchedUsers]);
  
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
    const selectable = fetchedUsers.filter(u => !isExisting(u) && fetchedProfiles.has(u.login));
    setSelected(new Set(selectable.map(u => u.login)));
  };
  
  const selectNone = () => {
    setSelected(new Set());
  };
  
  const handleFetch = () => {
    // Reset state
    setFetchedUsers([]);
    setFetchedProfiles(new Map());
    setSelected(new Set());
    pendingUsernames.current = [];
    skippedCount.current = 0;
    totalToFetch.current = 0;
    
    const modeLabel = mode === "both" ? "follows and followers of" : mode === "followers" ? "followers of" : "who";
    const modeAction = mode === "both" ? "" : mode === "followers" ? "" : " follows";
    
    setFetchProgress({
      status: "fetching-list",
      total: 0,
      fetched: 0,
      skipped: 0,
      message: `Fetching ${modeLabel} @${username}${modeAction}...`,
    });
    
    fetcher.submit(
      { intent: "fetch-user-list", username, mode },
      { method: "post" }
    );
  };
  
  const handleImport = () => {
    // Only import users that have full profiles fetched
    const toImport = fetchedUsers
      .filter(u => selected.has(u.login) && fetchedProfiles.has(u.login))
      .map(u => fetchedProfiles.get(u.login)!);
    
    fetcher.submit(
      { 
        intent: "import", 
        users: JSON.stringify(toImport),
        downloadAvatars: String(downloadAvatars)
      },
      { method: "post" }
    );
  };
  
  const isFetching = fetchProgress.status === "fetching-list" || fetchProgress.status === "fetching-profiles";
  const isImporting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "import";
  
  // Group users by location (using full profiles where available)
  const locationGroups = useMemo(() => {
    const groups = new Map<string, GitHubUserBasic[]>();
    
    for (const user of fetchedUsers) {
      const profile = fetchedProfiles.get(user.login);
      const location = profile?.location?.trim() || "(no location or profile not fetched)";
      if (!groups.has(location)) {
        groups.set(location, []);
      }
      groups.get(location)!.push(user);
    }
    
    // Sort by count descending
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [fetchedUsers, fetchedProfiles]);
  
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
          <h1 className="text-2xl font-semibold text-harbour-700">Import from GitHub Connections</h1>
        </div>
        
        <p className="text-harbour-500">
          Enter a GitHub username to see who they follow and/or who follows them. 
          Useful for finding local devs who don't list their location publicly.
        </p>
        
        {/* Rate limit indicator */}
        <div className="text-sm text-harbour-400">
          API Rate Limit: {currentRateLimit.remaining}/{currentRateLimit.limit} remaining
          {currentRateLimit.remaining < 100 && (
            <span className="text-amber-600 ml-2">
              (Resets at {new Date(currentRateLimit.reset).toLocaleTimeString()})
            </span>
          )}
          <span className="text-harbour-300 ml-2">
            (Octokit auto-throttles requests to respect limits)
          </span>
        </div>
        
        {/* Username input and mode selector */}
        <div className="flex items-center gap-4 flex-wrap">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="GitHub username"
            className="px-4 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none w-64"
            onKeyDown={(e) => {
              if (e.key === "Enter" && username.trim()) {
                handleFetch();
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
            onClick={handleFetch}
            disabled={!username.trim() || isFetching}
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
          >
            {isFetching ? "Fetching..." : "Fetch Users"}
          </button>
        </div>
        
        {/* Progress indicator */}
        {isFetching && (
          <div className="p-4 bg-blue-50 border border-blue-200">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span className="text-blue-700 font-medium">{fetchProgress.message}</span>
            </div>
            {fetchProgress.total > 0 && (
              <div className="mt-3">
                <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${((fetchProgress.fetched + fetchProgress.skipped) / fetchProgress.total) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  {fetchProgress.fetched + fetchProgress.skipped} / {fetchProgress.total} processed
                  {fetchProgress.skipped > 0 && (
                    <span className="text-amber-600 ml-2">({fetchProgress.skipped} skipped due to errors)</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Error display */}
        {fetchProgress.status === "error" && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">
            {fetchProgress.message}
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
        
        {fetchedUsers.length > 0 && (
          <>
            {/* Location groups summary */}
            <div className="border border-harbour-200 p-4 bg-harbour-50">
              <h2 className="font-semibold text-harbour-700 mb-3">
                Locations ({locationGroups.length} unique)
              </h2>
              <p className="text-sm text-harbour-500 mb-3">
                These are all the unique locations from the users. You can mention any that look like 
                Newfoundland locations to ensure they're recognized in searches.
              </p>
              <div className="flex flex-wrap gap-2">
                {locationGroups.map(([location, users]) => (
                  <span
                    key={location}
                    className={`px-2 py-1 text-sm border ${
                      location === "(no location or profile not fetched)"
                        ? "bg-grey-100 border-grey-300 text-grey-600"
                        : "bg-white border-harbour-200 text-harbour-700"
                    }`}
                  >
                    {location} ({users.length})
                  </span>
                ))}
              </div>
            </div>
            
            {/* Users list controls */}
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-harbour-500">
                Found {fetchedUsers.length} users, {fetchedProfiles.size} profiles fetched
                {fetchProgress.skipped > 0 && (
                  <span className="text-amber-600 ml-1">({fetchProgress.skipped} profiles couldn't be fetched)</span>
                )}
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
              <label className="flex items-center gap-2 text-sm ml-auto">
                <input
                  type="checkbox"
                  checked={downloadAvatars}
                  onChange={(e) => setDownloadAvatars(e.target.checked)}
                  className="rounded"
                />
                Download avatars
              </label>
            </div>
            
            {/* Users list */}
            <div className="flex flex-col gap-2">
              {fetchedUsers.map((user) => {
                const existing = isExisting(user);
                const profile = fetchedProfiles.get(user.login);
                const displayName = profile?.name || user.login;
                const hasProfile = !!profile;
                
                return (
                  <div
                    key={user.login}
                    className={`flex items-center gap-4 p-3 border ${
                      existing
                        ? "bg-harbour-50 border-harbour-200 opacity-60"
                        : !hasProfile
                        ? "bg-yellow-50 border-yellow-200"
                        : selected.has(user.login)
                        ? "bg-blue-50 border-blue-300"
                        : "bg-white border-harbour-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(user.login)}
                      onChange={() => toggleSelect(user.login)}
                      disabled={existing || !hasProfile}
                      className="w-5 h-5"
                    />
                    
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt=""
                        className="w-10 h-10 object-cover rounded-full bg-harbour-100"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-harbour-100 rounded-full" />
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
                        {!hasProfile && !existing && (
                          <span className="text-xs px-2 py-0.5 bg-yellow-200 text-yellow-700">
                            Profile not fetched
                          </span>
                        )}
                      </div>
                      {profile?.bio && (
                        <p className="text-sm text-harbour-500 truncate">
                          {profile.bio}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-sm text-harbour-400 flex-wrap">
                        {profile?.company && (
                          <span className="text-harbour-600">{profile.company}</span>
                        )}
                        {profile?.location && <span>{profile.location}</span>}
                        {profile?.public_repos !== undefined && profile.public_repos > 0 && (
                          <span>{profile.public_repos} repos</span>
                        )}
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
            
            {/* Import button */}
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
