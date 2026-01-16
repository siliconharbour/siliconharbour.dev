import { db } from "~/db";
import { 
  references, 
  events, 
  eventDates,
  companies, 
  groups, 
  learning, 
  people, 
  news, 
  jobs,
  projects,
  type ContentType,
  type Reference,
  type NewReference,
  contentTypes
} from "~/db/schema";
import { eq, and, or, asc, gte } from "drizzle-orm";

// =============================================================================
// Reference Parser - Extract [[references]] from markdown
// =============================================================================

const REFERENCE_REGEX = /\[\[([^\]]+)\]\]/g;

export interface ParsedReference {
  text: string;      // The text inside [[...]]
  fullMatch: string; // The full [[...]] match
  index: number;     // Position in the string
}

/**
 * Extract all [[reference]] patterns from markdown content
 */
export function parseReferences(content: string): ParsedReference[] {
  const refs: ParsedReference[] = [];
  let match;
  
  while ((match = REFERENCE_REGEX.exec(content)) !== null) {
    refs.push({
      text: match[1].trim(),
      fullMatch: match[0],
      index: match.index,
    });
  }
  
  return refs;
}

// =============================================================================
// Reference Resolver - Match reference text to actual entities
// =============================================================================

export interface ResolvedReference {
  text: string;
  type: ContentType;
  id: number;
  slug: string;
  name: string;
}

export interface UnresolvedReference {
  text: string;
  reason: "not_found" | "ambiguous";
  candidates?: { type: ContentType; id: number; name: string }[];
}

export type ResolveResult = 
  | { resolved: true; reference: ResolvedReference }
  | { resolved: false; reference: UnresolvedReference };

/**
 * Try to resolve a reference text to an actual entity
 * Searches across all content types by name/title
 */
export async function resolveReference(text: string): Promise<ResolveResult> {
  const normalizedText = text.toLowerCase().trim();
  const candidates: { type: ContentType; id: number; name: string; slug: string }[] = [];
  
  // Search events by title
  const eventMatches = await db.select({ id: events.id, title: events.title, slug: events.slug })
    .from(events)
    .where(eq(events.title, text));
  for (const e of eventMatches) {
    candidates.push({ type: "event", id: e.id, name: e.title, slug: e.slug });
  }
  
  // Search companies by name
  const companyMatches = await db.select({ id: companies.id, name: companies.name, slug: companies.slug })
    .from(companies)
    .where(eq(companies.name, text));
  for (const c of companyMatches) {
    candidates.push({ type: "company", id: c.id, name: c.name, slug: c.slug });
  }
  
  // Search groups by name
  const groupMatches = await db.select({ id: groups.id, name: groups.name, slug: groups.slug })
    .from(groups)
    .where(eq(groups.name, text));
  for (const g of groupMatches) {
    candidates.push({ type: "group", id: g.id, name: g.name, slug: g.slug });
  }
  
  // Search learning by name
  const learningMatches = await db.select({ id: learning.id, name: learning.name, slug: learning.slug })
    .from(learning)
    .where(eq(learning.name, text));
  for (const l of learningMatches) {
    candidates.push({ type: "learning", id: l.id, name: l.name, slug: l.slug });
  }
  
  // Search people by name
  const personMatches = await db.select({ id: people.id, name: people.name, slug: people.slug })
    .from(people)
    .where(eq(people.name, text));
  for (const p of personMatches) {
    candidates.push({ type: "person", id: p.id, name: p.name, slug: p.slug });
  }
  
  // Search news by title
  const newsMatches = await db.select({ id: news.id, title: news.title, slug: news.slug })
    .from(news)
    .where(eq(news.title, text));
  for (const n of newsMatches) {
    candidates.push({ type: "news", id: n.id, name: n.title, slug: n.slug });
  }
  
  // Search jobs by title
  const jobMatches = await db.select({ id: jobs.id, title: jobs.title, slug: jobs.slug })
    .from(jobs)
    .where(eq(jobs.title, text));
  for (const j of jobMatches) {
    candidates.push({ type: "job", id: j.id, name: j.title, slug: j.slug });
  }
  
  if (candidates.length === 0) {
    return {
      resolved: false,
      reference: { text, reason: "not_found" }
    };
  }
  
  if (candidates.length === 1) {
    const c = candidates[0];
    return {
      resolved: true,
      reference: { text, type: c.type, id: c.id, slug: c.slug, name: c.name }
    };
  }
  
  // Multiple matches - ambiguous
  return {
    resolved: false,
    reference: { 
      text, 
      reason: "ambiguous",
      candidates: candidates.map(c => ({ type: c.type, id: c.id, name: c.name }))
    }
  };
}

/**
 * Resolve multiple references at once
 */
export async function resolveReferences(texts: string[]): Promise<Map<string, ResolveResult>> {
  const results = new Map<string, ResolveResult>();
  
  // Dedupe
  const uniqueTexts = [...new Set(texts)];
  
  for (const text of uniqueTexts) {
    results.set(text, await resolveReference(text));
  }
  
  return results;
}

// =============================================================================
// Reference CRUD - Manage references in the database
// =============================================================================

/**
 * Get all references from a source entity
 */
export async function getOutgoingReferences(
  sourceType: ContentType, 
  sourceId: number
): Promise<Reference[]> {
  return db.select()
    .from(references)
    .where(and(
      eq(references.sourceType, sourceType),
      eq(references.sourceId, sourceId)
    ));
}

/**
 * Get all references to a target entity (backlinks)
 */
export async function getIncomingReferences(
  targetType: ContentType, 
  targetId: number
): Promise<Reference[]> {
  return db.select()
    .from(references)
    .where(and(
      eq(references.targetType, targetType),
      eq(references.targetId, targetId)
    ));
}

/**
 * Delete all references from a source entity
 */
export async function deleteReferencesFrom(
  sourceType: ContentType, 
  sourceId: number
): Promise<void> {
  await db.delete(references)
    .where(and(
      eq(references.sourceType, sourceType),
      eq(references.sourceId, sourceId)
    ));
}

/**
 * Update references for a content item based on its markdown content
 * This parses the content, resolves references, and updates the database
 */
export async function syncReferences(
  sourceType: ContentType,
  sourceId: number,
  content: string
): Promise<{ resolved: ResolvedReference[]; unresolved: UnresolvedReference[] }> {
  // Parse references from content
  const parsed = parseReferences(content);
  const texts = parsed.map(p => p.text);
  
  // Resolve all references
  const resolutions = await resolveReferences(texts);
  
  // Delete existing references from this source
  await deleteReferencesFrom(sourceType, sourceId);
  
  const resolved: ResolvedReference[] = [];
  const unresolved: UnresolvedReference[] = [];
  
  // Insert new references
  for (const [text, result] of resolutions) {
    if (result.resolved) {
      resolved.push(result.reference);
      
      // Don't create self-references
      if (result.reference.type === sourceType && result.reference.id === sourceId) {
        continue;
      }
      
      await db.insert(references).values({
        sourceType,
        sourceId,
        targetType: result.reference.type,
        targetId: result.reference.id,
        referenceText: text,
      });
    } else {
      unresolved.push(result.reference);
    }
  }
  
  return { resolved, unresolved };
}

// =============================================================================
// Content type URL helpers
// =============================================================================

const contentTypeRoutes: Record<ContentType, string> = {
  event: "/events",
  company: "/companies",
  group: "/groups",
  learning: "/learning",
  person: "/people",
  news: "/news",
  job: "/jobs",
  project: "/projects",
};

export function getContentUrl(type: ContentType, slug: string): string {
  return `${contentTypeRoutes[type]}/${slug}`;
}

// =============================================================================
// Rich reference data for display
// =============================================================================

export interface RichReference {
  type: ContentType;
  id: number;
  slug: string;
  name: string;
  url: string;
}

// =============================================================================
// Client preparation helpers
// =============================================================================

export interface SerializedRef {
  text: string;
  type: ContentType;
  slug: string;
  name: string;
}

/**
 * Prepare resolved references for client-side rendering
 * Call this in your loader and pass result to RichMarkdown component
 */
export async function prepareRefsForClient(content: string): Promise<Record<string, SerializedRef>> {
  const parsed = parseReferences(content);
  const texts = parsed.map(p => p.text);
  const resolutions = await resolveReferences(texts);
  
  const result: Record<string, SerializedRef> = {};
  
  for (const [text, resolution] of resolutions) {
    if (resolution.resolved) {
      result[text] = {
        text: resolution.reference.text,
        type: resolution.reference.type,
        slug: resolution.reference.slug,
        name: resolution.reference.name,
      };
    }
  }
  
  return result;
}

/**
 * Get rich data for incoming references (backlinks) to display on a page
 */
export async function getRichIncomingReferences(
  targetType: ContentType,
  targetId: number
): Promise<RichReference[]> {
  const refs = await getIncomingReferences(targetType, targetId);
  const rich: RichReference[] = [];
  
  for (const ref of refs) {
    // Fetch the source entity to get its name/title and slug
    let name = ref.referenceText;
    let slug = "";
    
    switch (ref.sourceType) {
      case "event": {
        const [e] = await db.select({ title: events.title, slug: events.slug })
          .from(events).where(eq(events.id, ref.sourceId));
        if (e) { name = e.title; slug = e.slug; }
        break;
      }
      case "company": {
        const [c] = await db.select({ name: companies.name, slug: companies.slug })
          .from(companies).where(eq(companies.id, ref.sourceId));
        if (c) { name = c.name; slug = c.slug; }
        break;
      }
      case "group": {
        const [g] = await db.select({ name: groups.name, slug: groups.slug })
          .from(groups).where(eq(groups.id, ref.sourceId));
        if (g) { name = g.name; slug = g.slug; }
        break;
      }
      case "learning": {
        const [l] = await db.select({ name: learning.name, slug: learning.slug })
          .from(learning).where(eq(learning.id, ref.sourceId));
        if (l) { name = l.name; slug = l.slug; }
        break;
      }
      case "person": {
        const [p] = await db.select({ name: people.name, slug: people.slug })
          .from(people).where(eq(people.id, ref.sourceId));
        if (p) { name = p.name; slug = p.slug; }
        break;
      }
      case "news": {
        const [n] = await db.select({ title: news.title, slug: news.slug })
          .from(news).where(eq(news.id, ref.sourceId));
        if (n) { name = n.title; slug = n.slug; }
        break;
      }
      case "job": {
        const [j] = await db.select({ title: jobs.title, slug: jobs.slug })
          .from(jobs).where(eq(jobs.id, ref.sourceId));
        if (j) { name = j.title; slug = j.slug; }
        break;
      }
    }
    
    if (slug) {
      rich.push({
        type: ref.sourceType,
        id: ref.sourceId,
        slug,
        name,
        url: getContentUrl(ref.sourceType, slug),
      });
    }
  }
  
  return rich;
}

// =============================================================================
// Detailed Backlinks - Full entity data for rich display
// =============================================================================

export type DetailedBacklink = 
  | { type: "event"; data: { id: number; slug: string; title: string; coverImage: string | null; nextDate: Date | null } }
  | { type: "company"; data: { id: number; slug: string; name: string; logo: string | null; location: string | null } }
  | { type: "group"; data: { id: number; slug: string; name: string; logo: string | null } }
  | { type: "learning"; data: { id: number; slug: string; name: string; logo: string | null; type: string | null } }
  | { type: "person"; data: { id: number; slug: string; name: string; avatar: string | null } }
  | { type: "news"; data: { id: number; slug: string; title: string; coverImage: string | null; excerpt: string | null; publishedAt: Date | null } }
  | { type: "job"; data: { id: number; slug: string; title: string; companyName: string | null; location: string | null; remote: boolean } }
  | { type: "project"; data: { id: number; slug: string; name: string; logo: string | null; type: string } };

/**
 * Get detailed backlink data for rich display on detail pages
 */
export async function getDetailedBacklinks(
  targetType: ContentType,
  targetId: number
): Promise<DetailedBacklink[]> {
  const refs = await getIncomingReferences(targetType, targetId);
  const backlinks: DetailedBacklink[] = [];
  const now = new Date();
  
  for (const ref of refs) {
    switch (ref.sourceType) {
      case "event": {
        const [event] = await db.select({
          id: events.id,
          slug: events.slug,
          title: events.title,
          coverImage: events.coverImage,
        }).from(events).where(eq(events.id, ref.sourceId));
        
        if (event) {
          // Get next upcoming date
          const [nextDate] = await db.select({ startDate: eventDates.startDate })
            .from(eventDates)
            .where(and(
              eq(eventDates.eventId, event.id),
              gte(eventDates.startDate, now)
            ))
            .orderBy(asc(eventDates.startDate))
            .limit(1);
          
          backlinks.push({
            type: "event",
            data: { ...event, nextDate: nextDate?.startDate ?? null }
          });
        }
        break;
      }
      case "company": {
        const [company] = await db.select({
          id: companies.id,
          slug: companies.slug,
          name: companies.name,
          logo: companies.logo,
          location: companies.location,
        }).from(companies).where(eq(companies.id, ref.sourceId));
        
        if (company) {
          backlinks.push({ type: "company", data: company });
        }
        break;
      }
      case "group": {
        const [group] = await db.select({
          id: groups.id,
          slug: groups.slug,
          name: groups.name,
          logo: groups.logo,
        }).from(groups).where(eq(groups.id, ref.sourceId));
        
        if (group) {
          backlinks.push({ type: "group", data: group });
        }
        break;
      }
      case "learning": {
        const [inst] = await db.select({
          id: learning.id,
          slug: learning.slug,
          name: learning.name,
          logo: learning.logo,
          type: learning.type,
        }).from(learning).where(eq(learning.id, ref.sourceId));
        
        if (inst) {
          backlinks.push({ type: "learning", data: inst });
        }
        break;
      }
      case "person": {
        const [person] = await db.select({
          id: people.id,
          slug: people.slug,
          name: people.name,
          avatar: people.avatar,
        }).from(people).where(eq(people.id, ref.sourceId));
        
        if (person) {
          backlinks.push({ type: "person", data: person });
        }
        break;
      }
      case "news": {
        const [article] = await db.select({
          id: news.id,
          slug: news.slug,
          title: news.title,
          coverImage: news.coverImage,
          excerpt: news.excerpt,
          publishedAt: news.publishedAt,
        }).from(news).where(eq(news.id, ref.sourceId));
        
        if (article) {
          backlinks.push({ type: "news", data: article });
        }
        break;
      }
      case "job": {
        const [job] = await db.select({
          id: jobs.id,
          slug: jobs.slug,
          title: jobs.title,
          companyName: jobs.companyName,
          location: jobs.location,
          remote: jobs.remote,
        }).from(jobs).where(eq(jobs.id, ref.sourceId));
        
        if (job) {
          backlinks.push({ type: "job", data: job });
        }
        break;
      }
      case "project": {
        const [project] = await db.select({
          id: projects.id,
          slug: projects.slug,
          name: projects.name,
          logo: projects.logo,
          type: projects.type,
        }).from(projects).where(eq(projects.id, ref.sourceId));
        
        if (project) {
          backlinks.push({ type: "project", data: project });
        }
        break;
      }
    }
  }
  
  return backlinks;
}
