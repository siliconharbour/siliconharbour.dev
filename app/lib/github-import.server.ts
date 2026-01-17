/**
 * GitHub Import Job Service
 * 
 * Handles incremental, rate-limit-aware importing of GitHub users.
 * Progress is persisted to allow resuming interrupted imports.
 */

import { db } from "~/db";
import { importJobs, type ImportJob } from "~/db/schema";
import { eq } from "drizzle-orm";
import { 
  searchNewfoundlandUsers, 
  getUserProfileWithRateLimit,
  fetchAvatar,
  type GitHubUserWithSocials,
  type RateLimitInfo,
} from "./github.server";
import { createPerson, updatePerson, getPersonByName, getPersonByGitHub } from "./people.server";
import { findCompanyByFuzzyName, parseGitHubCompanyField, extractCompanyFromBio, updateCompany } from "./companies.server";
import { processAndSaveIconImageWithPadding } from "./images.server";

const GITHUB_IMPORT_JOB_ID = "github-newfoundland";
const USERS_PER_PAGE = 30;
const BATCH_SIZE = 5; // Process 5 users per action call to stay responsive

export interface ImportProgress {
  status: ImportJob["status"];
  totalItems: number;
  processedItems: number;
  currentPage: number;
  totalPages: number;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  rateLimitRemaining: number | null;
  rateLimitReset: Date | null;
  lastError: string | null;
  lastActivity: Date | null;
  canResume: boolean;
  waitingForRateLimit: boolean;
}

/**
 * Get current import job status
 */
export async function getImportProgress(): Promise<ImportProgress> {
  const job = await db.select().from(importJobs).where(eq(importJobs.id, GITHUB_IMPORT_JOB_ID)).get();
  
  if (!job) {
    return {
      status: "idle",
      totalItems: 0,
      processedItems: 0,
      currentPage: 1,
      totalPages: 0,
      importedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      rateLimitRemaining: null,
      rateLimitReset: null,
      lastError: null,
      lastActivity: null,
      canResume: false,
      waitingForRateLimit: false,
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
    totalItems: job.totalItems ?? 0,
    processedItems: job.processedItems ?? 0,
    currentPage: job.currentPage ?? 1,
    totalPages: job.totalPages ?? 0,
    importedCount: job.importedCount ?? 0,
    skippedCount: job.skippedCount ?? 0,
    errorCount: job.errorCount ?? 0,
    rateLimitRemaining: job.rateLimitRemaining,
    rateLimitReset: job.rateLimitReset ? new Date(job.rateLimitReset * 1000) : null,
    lastError: job.lastError,
    lastActivity: job.lastActivity,
    canResume: job.status === "paused" || job.status === "error",
    waitingForRateLimit,
  };
}

/**
 * Start or resume the GitHub import job
 */
export async function startImport(): Promise<ImportProgress> {
  const existing = await db.select().from(importJobs).where(eq(importJobs.id, GITHUB_IMPORT_JOB_ID)).get();
  
  if (existing?.status === "running") {
    // Already running
    return getImportProgress();
  }
  
  // Check if we need to wait for rate limit
  if (existing?.rateLimitRemaining === 0 && existing?.rateLimitReset) {
    const resetTime = existing.rateLimitReset * 1000;
    if (resetTime > Date.now()) {
      // Still rate limited, update status but can't proceed
      await db.update(importJobs)
        .set({ 
          status: "paused",
          lastError: `Rate limited until ${new Date(resetTime).toLocaleTimeString()}`,
          lastActivity: new Date(),
        })
        .where(eq(importJobs.id, GITHUB_IMPORT_JOB_ID));
      return getImportProgress();
    }
  }
  
  if (!existing) {
    // First run - get total count
    try {
      const searchResult = await searchNewfoundlandUsers(1, 1);
      const totalPages = Math.ceil(searchResult.total / USERS_PER_PAGE);
      
      await db.insert(importJobs).values({
        id: GITHUB_IMPORT_JOB_ID,
        status: "running",
        totalItems: searchResult.total,
        processedItems: 0,
        currentPage: 1,
        totalPages,
        rateLimitRemaining: searchResult.rateLimit.remaining,
        rateLimitReset: Math.floor(searchResult.rateLimit.reset.getTime() / 1000),
        importedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        lastActivity: new Date(),
        createdAt: new Date(),
      });
    } catch (e) {
      const errorMsg = String(e);
      await db.insert(importJobs).values({
        id: GITHUB_IMPORT_JOB_ID,
        status: "error",
        lastError: errorMsg,
        lastActivity: new Date(),
        createdAt: new Date(),
      });
      return getImportProgress();
    }
  } else {
    // Resume existing job
    await db.update(importJobs)
      .set({ 
        status: "running",
        lastError: null,
        lastActivity: new Date(),
      })
      .where(eq(importJobs.id, GITHUB_IMPORT_JOB_ID));
  }
  
  return getImportProgress();
}

/**
 * Process the next batch of users
 * Returns the updated progress
 */
export async function processNextBatch(downloadAvatars: boolean = true): Promise<{
  progress: ImportProgress;
  processed: string[];
  errors: string[];
}> {
  const job = await db.select().from(importJobs).where(eq(importJobs.id, GITHUB_IMPORT_JOB_ID)).get();
  
  if (!job || job.status !== "running") {
    return {
      progress: await getImportProgress(),
      processed: [],
      errors: ["Import job is not running"],
    };
  }
  
  const processed: string[] = [];
  const errors: string[] = [];
  let rateLimit: RateLimitInfo | null = null;
  
  try {
    // Fetch current page of users
    const searchResult = await searchNewfoundlandUsers(job.currentPage ?? 1, USERS_PER_PAGE);
    rateLimit = searchResult.rateLimit;
    
    if (searchResult.users.length === 0) {
      // No more users, we're done
      await db.update(importJobs)
        .set({
          status: "completed",
          lastActivity: new Date(),
          rateLimitRemaining: rateLimit.remaining,
          rateLimitReset: Math.floor(rateLimit.reset.getTime() / 1000),
        })
        .where(eq(importJobs.id, GITHUB_IMPORT_JOB_ID));
      
      return {
        progress: await getImportProgress(),
        processed: ["Import completed!"],
        errors: [],
      };
    }
    
    // Process up to BATCH_SIZE users from this page
    const startIdx = (job.processedItems ?? 0) % USERS_PER_PAGE;
    const usersToProcess = searchResult.users.slice(startIdx, startIdx + BATCH_SIZE);
    
    let importedCount = job.importedCount ?? 0;
    let skippedCount = job.skippedCount ?? 0;
    let errorCount = job.errorCount ?? 0;
    let processedItems = job.processedItems ?? 0;
    
    for (const searchUser of usersToProcess) {
      try {
        // Fetch full profile
        const { user, rateLimit: profileRateLimit } = await getUserProfileWithRateLimit(searchUser.login);
        rateLimit = profileRateLimit;
        
        if (rateLimit.remaining < 5) {
          // Getting low, pause and wait
          await db.update(importJobs)
            .set({
              status: "paused",
              processedItems,
              importedCount,
              skippedCount,
              errorCount,
              rateLimitRemaining: rateLimit.remaining,
              rateLimitReset: Math.floor(rateLimit.reset.getTime() / 1000),
              lastError: `Paused: rate limit low (${rateLimit.remaining} remaining)`,
              lastActivity: new Date(),
            })
            .where(eq(importJobs.id, GITHUB_IMPORT_JOB_ID));
          
          return {
            progress: await getImportProgress(),
            processed,
            errors: [...errors, `Paused due to rate limit (${rateLimit.remaining} remaining)`],
          };
        }
        
        const result = await importSingleUser(user, downloadAvatars);
        processedItems++;
        
        if (result.action === "imported" || result.action === "merged") {
          importedCount++;
          processed.push(`${result.name} (${result.action})`);
        } else {
          skippedCount++;
          processed.push(`${result.name} (${result.action})`);
        }
      } catch (e) {
        const errorMsg = String(e);
        if (errorMsg.startsWith("RATE_LIMITED:")) {
          const resetTime = parseInt(errorMsg.split(":")[1]);
          await db.update(importJobs)
            .set({
              status: "paused",
              processedItems,
              importedCount,
              skippedCount,
              errorCount,
              rateLimitRemaining: 0,
              rateLimitReset: Math.floor(resetTime / 1000),
              lastError: `Rate limited until ${new Date(resetTime).toLocaleTimeString()}`,
              lastActivity: new Date(),
            })
            .where(eq(importJobs.id, GITHUB_IMPORT_JOB_ID));
          
          return {
            progress: await getImportProgress(),
            processed,
            errors: [...errors, `Rate limited until ${new Date(resetTime).toLocaleTimeString()}`],
          };
        }
        
        errorCount++;
        processedItems++;
        errors.push(`${searchUser.login}: ${errorMsg}`);
      }
    }
    
    // Check if we need to move to next page
    let currentPage = job.currentPage ?? 1;
    if (processedItems >= currentPage * USERS_PER_PAGE) {
      currentPage++;
    }
    
    // Check if we're done
    const isComplete = currentPage > (job.totalPages ?? 0) || 
      processedItems >= (job.totalItems ?? 0);
    
    await db.update(importJobs)
      .set({
        status: isComplete ? "completed" : "running",
        processedItems,
        currentPage,
        importedCount,
        skippedCount,
        errorCount,
        rateLimitRemaining: rateLimit?.remaining ?? null,
        rateLimitReset: rateLimit ? Math.floor(rateLimit.reset.getTime() / 1000) : null,
        lastActivity: new Date(),
        lastError: null,
      })
      .where(eq(importJobs.id, GITHUB_IMPORT_JOB_ID));
    
  } catch (e) {
    const errorMsg = String(e);
    await db.update(importJobs)
      .set({
        status: "error",
        lastError: errorMsg,
        lastActivity: new Date(),
      })
      .where(eq(importJobs.id, GITHUB_IMPORT_JOB_ID));
    
    errors.push(errorMsg);
  }
  
  return {
    progress: await getImportProgress(),
    processed,
    errors,
  };
}

/**
 * Pause the import job
 */
export async function pauseImport(): Promise<ImportProgress> {
  await db.update(importJobs)
    .set({
      status: "paused",
      lastActivity: new Date(),
    })
    .where(eq(importJobs.id, GITHUB_IMPORT_JOB_ID));
  
  return getImportProgress();
}

/**
 * Reset the import job (start over)
 */
export async function resetImport(): Promise<ImportProgress> {
  await db.delete(importJobs).where(eq(importJobs.id, GITHUB_IMPORT_JOB_ID));
  return getImportProgress();
}

/**
 * Import a single GitHub user
 */
async function importSingleUser(
  user: GitHubUserWithSocials,
  downloadAvatars: boolean
): Promise<{ name: string; action: "imported" | "merged" | "skipped" }> {
  const githubUrl = user.html_url;
  const displayName = user.name || user.login;
  
  // Check if person already exists
  const existingByGitHub = await getPersonByGitHub(githubUrl);
  if (existingByGitHub) {
    return { name: displayName, action: "skipped" };
  }
  
  const existingByName = await getPersonByName(displayName);
  
  // Download avatar if requested
  let avatar: string | null = null;
  if (downloadAvatars && user.avatar_url) {
    const imageBuffer = await fetchAvatar(user.avatar_url);
    if (imageBuffer) {
      avatar = await processAndSaveIconImageWithPadding(imageBuffer);
    }
  }
  
  // Try to find company from GitHub company field or bio
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
  
  // Update company's github field if we found a match
  if (githubOrgUrl && matchedCompany && !matchedCompany.github) {
    await updateCompany(matchedCompany.id, { github: githubOrgUrl });
  }
  
  // Build bio with company reference
  let bio = user.bio || "";
  const companyRefName = matchedCompany?.name || companyName;
  
  if (companyRefName && !bio.toLowerCase().includes(companyRefName.toLowerCase())) {
    const companyRef = `[[${companyRefName}]]`;
    if (bio) {
      bio = `${bio}\n\nWorks at ${companyRef}.`;
    } else {
      bio = `GitHub user from ${user.location || "Newfoundland"}. Works at ${companyRef}.`;
    }
  } else if (!bio) {
    bio = `GitHub user from ${user.location || "Newfoundland"}.`;
  }
  
  // Build social links from GitHub profile
  // GitHub provides twitter_username directly, and social_accounts for others
  const socialLinks: Record<string, string> = {};
  
  // Twitter can come from twitter_username field or social accounts
  if (user.twitter_username) {
    socialLinks.twitter = `https://twitter.com/${user.twitter_username}`;
  }
  
  // Process social accounts (instagram, linkedin, etc.)
  for (const account of user.socialAccounts || []) {
    const provider = account.provider.toLowerCase();
    if (provider === "twitter" && !socialLinks.twitter) {
      socialLinks.twitter = account.url;
    } else if (provider === "linkedin" || provider === "linkedin_company") {
      socialLinks.linkedin = account.url;
    } else if (provider === "instagram") {
      socialLinks.instagram = account.url;
    } else if (provider === "youtube") {
      socialLinks.youtube = account.url;
    } else if (provider === "mastodon") {
      socialLinks.mastodon = account.url;
    } else if (provider === "facebook") {
      socialLinks.facebook = account.url;
    }
    // Other providers can be added as needed
  }
  
  const socialLinksJson = Object.keys(socialLinks).length > 0 
    ? JSON.stringify(socialLinks) 
    : null;
  
  if (existingByName) {
    // Merge with existing person
    if (!existingByName.github) {
      // Parse existing social links to merge
      let existingSocialLinks: Record<string, string> = {};
      if (existingByName.socialLinks) {
        try {
          existingSocialLinks = JSON.parse(existingByName.socialLinks);
        } catch {
          // ignore
        }
      }
      
      // Merge social links (prefer existing values)
      const mergedSocialLinks = { ...socialLinks, ...existingSocialLinks };
      const mergedSocialLinksJson = Object.keys(mergedSocialLinks).length > 0 
        ? JSON.stringify(mergedSocialLinks) 
        : null;
      
      await updatePerson(existingByName.id, {
        github: githubUrl,
        website: existingByName.website || user.blog || null,
        avatar: existingByName.avatar || avatar,
        bio: existingByName.bio?.startsWith("GitHub user from") ? bio : existingByName.bio,
        socialLinks: mergedSocialLinksJson,
      });
      return { name: displayName, action: "merged" };
    }
    return { name: displayName, action: "skipped" };
  }
  
  // Create new person (hidden by default - needs manual review)
  await createPerson({
    name: displayName,
    bio,
    website: user.blog || null,
    github: githubUrl,
    avatar,
    socialLinks: socialLinksJson,
    visible: false, // Imported users start hidden until reviewed
  });
  
  return { name: displayName, action: "imported" };
}
