/**
 * Technology Extraction from Job Descriptions
 * 
 * Scans job description text for mentions of known technologies
 * and stores them in the job_technology_mentions table.
 */

import { db } from "~/db";
import { technologies, jobTechnologyMentions, jobs } from "~/db/schema";
import { eq, and } from "drizzle-orm";
import { normalizeTextForDisplay } from "./text.server";

interface TechPattern {
  id: number;
  slug: string;
  name: string;
  patterns: RegExp[];
}

/**
 * Build regex patterns for a technology
 * Handles common variations and word boundaries
 */
function buildPatterns(name: string, slug: string): RegExp[] {
  const patterns: RegExp[] = [];
  
  // Exact name match (case insensitive, word boundary)
  patterns.push(new RegExp(`\\b${escapeRegex(name)}\\b`, "i"));
  
  // Common variations
  const variations: Record<string, string[]> = {
    "javascript": ["js", "javascript", "ecmascript"],
    "typescript": ["ts", "typescript"],
    "react": ["react", "reactjs", "react.js"],
    "node.js": ["node", "nodejs", "node.js"],
    "next.js": ["next", "nextjs", "next.js"],
    "vue": ["vue", "vuejs", "vue.js"],
    "angular": ["angular", "angularjs"],
    "python": ["python", "python3"],
    "ruby": ["ruby"],
    "rails": ["rails", "ruby on rails", "ror"],
    "postgresql": ["postgres", "postgresql", "psql"],
    "mongodb": ["mongo", "mongodb"],
    "redis": ["redis"],
    "docker": ["docker", "containerization"],
    "kubernetes": ["kubernetes", "k8s"],
    "aws": ["aws", "amazon web services"],
    "gcp": ["gcp", "google cloud", "google cloud platform"],
    "azure": ["azure", "microsoft azure"],
    "terraform": ["terraform", "tf"],
    "graphql": ["graphql", "gql"],
    "rest": ["rest api", "restful"],
    "git": ["git"],
    "github": ["github"],
    "gitlab": ["gitlab"],
    "ci/cd": ["ci/cd", "cicd", "continuous integration", "continuous deployment"],
    "machine learning": ["machine learning", "ml"],
    "artificial intelligence": ["ai", "artificial intelligence"],
    "deep learning": ["deep learning", "dl"],
    "llm": ["llm", "large language model"],
    "c#": ["c#", "csharp", "c-sharp"],
    "c++": ["c++", "cpp"],
    ".net": [".net", "dotnet", ".net core"],
    "java": ["java"],
    "spring": ["spring", "spring boot"],
    "go": ["golang", "go lang"],
    "rust": ["rust"],
    "swift": ["swift"],
    "kotlin": ["kotlin"],
    "flutter": ["flutter"],
    "react native": ["react native", "react-native"],
    "electron": ["electron", "electronjs"],
    "tailwind": ["tailwind", "tailwindcss"],
    "sass": ["sass", "scss"],
    "webpack": ["webpack"],
    "vite": ["vite", "vitejs"],
    "elasticsearch": ["elasticsearch", "elastic search", "es"],
    "rabbitmq": ["rabbitmq", "rabbit mq"],
    "kafka": ["kafka", "apache kafka"],
  };
  
  const slugLower = slug.toLowerCase();
  if (variations[slugLower]) {
    for (const variant of variations[slugLower]) {
      patterns.push(new RegExp(`\\b${escapeRegex(variant)}\\b`, "i"));
    }
  }
  
  return patterns;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract a context snippet around a match
 */
function extractContext(text: string, match: RegExpMatchArray, contextLength: number = 100): string {
  const index = match.index || 0;
  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + match[0].length + contextLength);
  
  let context = text.slice(start, end);
  if (start > 0) context = "..." + context;
  if (end < text.length) context = context + "...";

  return normalizeTextForDisplay(context);
}

/**
 * Calculate confidence score based on match quality
 */
function calculateConfidence(match: RegExpMatchArray, text: string, techName: string): number {
  let confidence = 50; // Base confidence
  
  // Exact case match bonus
  if (match[0] === techName) {
    confidence += 20;
  }
  
  // Multiple mentions bonus
  const regex = new RegExp(escapeRegex(match[0]), "gi");
  const mentionCount = (text.match(regex) || []).length;
  if (mentionCount > 1) {
    confidence += Math.min(20, mentionCount * 5);
  }
  
  // Context quality - tech requirements section
  const context = text.slice(Math.max(0, (match.index || 0) - 200), (match.index || 0) + 200).toLowerCase();
  if (context.includes("requirements") || context.includes("qualifications") || context.includes("experience with")) {
    confidence += 10;
  }
  
  return Math.min(100, confidence);
}

/**
 * Extract technology mentions from a job description
 */
export async function extractTechnologiesFromJob(jobId: number): Promise<{ found: number; inserted: number }> {
  // Get the job
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  
  if (!job || !job.descriptionText) {
    return { found: 0, inserted: 0 };
  }
  
  // Get all visible technologies
  const techs = await db
    .select()
    .from(technologies)
    .where(eq(technologies.visible, true));
  
  // Build patterns for each technology
  const techPatterns: TechPattern[] = techs.map(tech => ({
    id: tech.id,
    slug: tech.slug,
    name: tech.name,
    patterns: buildPatterns(tech.name, tech.slug),
  }));
  
  // Find existing mentions for this job
  const existingMentions = await db
    .select({ technologyId: jobTechnologyMentions.technologyId })
    .from(jobTechnologyMentions)
    .where(eq(jobTechnologyMentions.jobId, jobId));
  
  const existingTechIds = new Set(existingMentions.map(m => m.technologyId));
  
  const text = job.descriptionText;
  const mentions: Array<{
    technologyId: number;
    confidence: number;
    context: string;
  }> = [];
  
  // Search for each technology
  for (const tech of techPatterns) {
    for (const pattern of tech.patterns) {
      const match = text.match(pattern);
      if (match) {
        // Skip if we already have a mention for this tech
        if (existingTechIds.has(tech.id)) break;
        
        mentions.push({
          technologyId: tech.id,
          confidence: calculateConfidence(match, text, tech.name),
          context: extractContext(text, match),
        });
        
        // Only record one mention per technology per job
        existingTechIds.add(tech.id);
        break;
      }
    }
  }
  
  // Insert new mentions
  if (mentions.length > 0) {
    const now = new Date();
    await db.insert(jobTechnologyMentions).values(
      mentions.map(m => ({
        jobId: jobId,
        technologyId: m.technologyId,
        confidence: m.confidence,
        context: m.context,
        createdAt: now,
      }))
    );
  }
  
  return { found: mentions.length, inserted: mentions.length };
}

/**
 * Extract technologies from all jobs for a company
 */
export async function extractTechnologiesForCompany(companyId: number): Promise<{ jobs: number; mentions: number }> {
  const companyJobs = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(
      eq(jobs.companyId, companyId),
      eq(jobs.status, "active"),
    ));
  
  let totalMentions = 0;
  for (const job of companyJobs) {
    const result = await extractTechnologiesFromJob(job.id);
    totalMentions += result.inserted;
  }
  
  return { jobs: companyJobs.length, mentions: totalMentions };
}

/**
 * Extract technologies from all active jobs
 */
export async function extractTechnologiesFromAllJobs(): Promise<{ jobs: number; mentions: number }> {
  const allJobs = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.status, "active"));
  
  let totalMentions = 0;
  for (const job of allJobs) {
    const result = await extractTechnologiesFromJob(job.id);
    totalMentions += result.inserted;
  }
  
  return { jobs: allJobs.length, mentions: totalMentions };
}

/**
 * Get technology mentions for a job
 */
export async function getTechMentionsForJob(jobId: number) {
  return db
    .select({
      technology: technologies,
      mention: jobTechnologyMentions,
    })
    .from(jobTechnologyMentions)
    .innerJoin(technologies, eq(jobTechnologyMentions.technologyId, technologies.id))
    .where(eq(jobTechnologyMentions.jobId, jobId))
    .orderBy(jobTechnologyMentions.confidence);
}

/**
 * Clear all technology mentions for a job (for re-extraction)
 */
export async function clearTechMentionsForJob(jobId: number) {
  await db
    .delete(jobTechnologyMentions)
    .where(eq(jobTechnologyMentions.jobId, jobId));
}
