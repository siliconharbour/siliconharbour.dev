import { db } from "~/db";
import {
  references,
  events,
  eventDates,
  companies,
  groups,
  education,
  people,
  news,
  jobs,
  projects,
  type ContentType,
  type Reference,
} from "~/db/schema";
import { eq, and, asc, gte } from "drizzle-orm";

// =============================================================================
// Visibility helpers
// =============================================================================

/**
 * Check if an entity is visible (for content types that support visibility)
 * Returns true for content types without visibility (events, news, jobs)
 */
async function isEntityVisible(type: ContentType, id: number): Promise<boolean> {
  switch (type) {
    case "company": {
      const [c] = await db
        .select({ visible: companies.visible })
        .from(companies)
        .where(eq(companies.id, id));
      return c?.visible ?? false;
    }
    case "group": {
      const [g] = await db
        .select({ visible: groups.visible })
        .from(groups)
        .where(eq(groups.id, id));
      return g?.visible ?? false;
    }
    case "education": {
      const [e] = await db
        .select({ visible: education.visible })
        .from(education)
        .where(eq(education.id, id));
      return e?.visible ?? false;
    }
    case "person": {
      const [p] = await db
        .select({ visible: people.visible })
        .from(people)
        .where(eq(people.id, id));
      return p?.visible ?? false;
    }
    // These content types don't have visibility - always visible
    case "event":
    case "news":
    case "job":
    case "project":
    case "product":
      return true;
    default:
      return true;
  }
}

// =============================================================================
// Reference Parser - Extract [[references]] from markdown
// =============================================================================

// Matches both simple [[Target]] and relation [[{Relation} at|of {Target}]] syntax
const REFERENCE_REGEX = /\[\[([^\]]+)\]\]/g;
// Matches the relation syntax: {Relation} at|of {Target}
const RELATION_REGEX = /^\{([^}]+)\}\s+(at|of)\s+\{([^}]+)\}$/i;

export interface ParsedReference {
  text: string; // The target text (entity name)
  relation?: string; // Optional relation (e.g., "CEO", "Founder")
  fullMatch: string; // The full [[...]] match
  index: number; // Position in the string
}

/**
 * Extract all [[reference]] patterns from markdown content
 * Supports both simple [[Target]] and [[{Relation} at|of {Target}]] syntax
 */
export function parseReferences(content: string): ParsedReference[] {
  const refs: ParsedReference[] = [];
  let match;

  while ((match = REFERENCE_REGEX.exec(content)) !== null) {
    const inner = match[1].trim();
    const relationMatch = RELATION_REGEX.exec(inner);

    if (relationMatch) {
      // Relation syntax: [[{CEO} at {CoLab Software}]] or [[{CEO} of {CoLab Software}]]
      refs.push({
        text: relationMatch[3].trim(),
        relation: relationMatch[1].trim(),
        fullMatch: match[0],
        index: match.index,
      });
    } else {
      // Simple syntax: [[CoLab Software]]
      refs.push({
        text: inner,
        fullMatch: match[0],
        index: match.index,
      });
    }
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
  const candidates: { type: ContentType; id: number; name: string; slug: string }[] = [];

  // Search events by title
  const eventMatches = await db
    .select({ id: events.id, title: events.title, slug: events.slug })
    .from(events)
    .where(eq(events.title, text));
  for (const e of eventMatches) {
    candidates.push({ type: "event", id: e.id, name: e.title, slug: e.slug });
  }

  // Search companies by name
  const companyMatches = await db
    .select({ id: companies.id, name: companies.name, slug: companies.slug })
    .from(companies)
    .where(eq(companies.name, text));
  for (const c of companyMatches) {
    candidates.push({ type: "company", id: c.id, name: c.name, slug: c.slug });
  }

  // Search groups by name
  const groupMatches = await db
    .select({ id: groups.id, name: groups.name, slug: groups.slug })
    .from(groups)
    .where(eq(groups.name, text));
  for (const g of groupMatches) {
    candidates.push({ type: "group", id: g.id, name: g.name, slug: g.slug });
  }

  // Search education by name
  const educationMatches = await db
    .select({ id: education.id, name: education.name, slug: education.slug })
    .from(education)
    .where(eq(education.name, text));
  for (const l of educationMatches) {
    candidates.push({ type: "education", id: l.id, name: l.name, slug: l.slug });
  }

  // Search people by name
  const personMatches = await db
    .select({ id: people.id, name: people.name, slug: people.slug })
    .from(people)
    .where(eq(people.name, text));
  for (const p of personMatches) {
    candidates.push({ type: "person", id: p.id, name: p.name, slug: p.slug });
  }

  // Search news by title
  const newsMatches = await db
    .select({ id: news.id, title: news.title, slug: news.slug })
    .from(news)
    .where(eq(news.title, text));
  for (const n of newsMatches) {
    candidates.push({ type: "news", id: n.id, name: n.title, slug: n.slug });
  }

  // Search jobs by title
  const jobMatches = await db
    .select({ id: jobs.id, title: jobs.title, slug: jobs.slug })
    .from(jobs)
    .where(eq(jobs.title, text));
  for (const j of jobMatches) {
    if (j.slug) {
      candidates.push({ type: "job", id: j.id, name: j.title, slug: j.slug });
    }
  }

  if (candidates.length === 0) {
    return {
      resolved: false,
      reference: { text, reason: "not_found" },
    };
  }

  if (candidates.length === 1) {
    const c = candidates[0];
    return {
      resolved: true,
      reference: { text, type: c.type, id: c.id, slug: c.slug, name: c.name },
    };
  }

  // Multiple matches - ambiguous
  return {
    resolved: false,
    reference: {
      text,
      reason: "ambiguous",
      candidates: candidates.map((c) => ({ type: c.type, id: c.id, name: c.name })),
    },
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
  sourceId: number,
): Promise<Reference[]> {
  return db
    .select()
    .from(references)
    .where(and(eq(references.sourceType, sourceType), eq(references.sourceId, sourceId)));
}

/**
 * Get all references to a target entity (backlinks)
 */
export async function getIncomingReferences(
  targetType: ContentType,
  targetId: number,
): Promise<Reference[]> {
  return db
    .select()
    .from(references)
    .where(and(eq(references.targetType, targetType), eq(references.targetId, targetId)));
}

/**
 * Delete all references from a source entity
 * If field is specified, only delete references from that field
 */
export async function deleteReferencesFrom(
  sourceType: ContentType,
  sourceId: number,
  field?: string,
): Promise<void> {
  if (field) {
    await db
      .delete(references)
      .where(
        and(
          eq(references.sourceType, sourceType),
          eq(references.sourceId, sourceId),
          eq(references.field, field),
        ),
      );
  } else {
    await db
      .delete(references)
      .where(and(eq(references.sourceType, sourceType), eq(references.sourceId, sourceId)));
  }
}

/**
 * Update references for a content item based on its markdown content
 * This parses the content, resolves references, and updates the database
 */
export async function syncReferences(
  sourceType: ContentType,
  sourceId: number,
  content: string,
  field: string = "description",
): Promise<{ resolved: ResolvedReference[]; unresolved: UnresolvedReference[] }> {
  // Parse references from content
  const parsed = parseReferences(content);

  // Build a map of text -> relation for quick lookup
  const relationMap = new Map<string, string | undefined>();
  for (const p of parsed) {
    // If we've seen this text before without a relation, but now have one, use the relation
    const existing = relationMap.get(p.text);
    if (!existing && p.relation) {
      relationMap.set(p.text, p.relation);
    } else if (!relationMap.has(p.text)) {
      relationMap.set(p.text, p.relation);
    }
  }

  const texts = parsed.map((p) => p.text);

  // Resolve all references
  const resolutions = await resolveReferences(texts);

  // Delete existing references from this source for this field only
  await deleteReferencesFrom(sourceType, sourceId, field);

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
        relation: relationMap.get(text) || null,
        field,
      });
    } else {
      unresolved.push(result.reference);
    }
  }

  return { resolved, unresolved };
}

/**
 * Sync organizer references for an event
 * Parses comma-separated organizer names and creates references for any that match entities
 */
export async function syncOrganizerReferences(
  eventId: number,
  organizer: string | null,
): Promise<{ resolved: ResolvedReference[]; unresolved: string[] }> {
  // Delete existing organizer references
  await deleteReferencesFrom("event", eventId, "organizer");

  if (!organizer || !organizer.trim()) {
    return { resolved: [], unresolved: [] };
  }

  // Split by comma and trim each name
  const names = organizer
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  // Resolve all names
  const resolutions = await resolveReferences(names);

  const resolved: ResolvedReference[] = [];
  const unresolved: string[] = [];

  for (const [text, result] of resolutions) {
    if (result.resolved) {
      resolved.push(result.reference);

      await db.insert(references).values({
        sourceType: "event",
        sourceId: eventId,
        targetType: result.reference.type,
        targetId: result.reference.id,
        referenceText: text,
        relation: "Organizer",
        field: "organizer",
      });
    } else {
      unresolved.push(text);
    }
  }

  return { resolved, unresolved };
}

/**
 * Resolve organizer text to links for display
 * Returns an array of organizer items, each either resolved (with link data) or unresolved (plain text)
 * Note: This returns url directly so the client doesn't need to import server-only code
 */
export async function resolveOrganizers(organizer: string | null): Promise<
  Array<{
    text: string;
    resolved: boolean;
    url?: string;
    name?: string;
  }>
> {
  if (!organizer || !organizer.trim()) {
    return [];
  }

  const names = organizer
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  const resolutions = await resolveReferences(names);

  const items: Array<{ text: string; resolved: boolean; url?: string; name?: string }> = [];

  for (const name of names) {
    const result = resolutions.get(name);
    if (result?.resolved) {
      // Check visibility
      const isVisible = await isEntityVisible(result.reference.type, result.reference.id);
      if (isVisible) {
        items.push({
          text: name,
          resolved: true,
          url: getContentUrl(result.reference.type, result.reference.slug),
          name: result.reference.name,
        });
      } else {
        items.push({ text: name, resolved: false });
      }
    } else {
      items.push({ text: name, resolved: false });
    }
  }

  return items;
}

// =============================================================================
// Content type URL helpers
// =============================================================================

const contentTypeRoutes: Record<ContentType, string> = {
  event: "/events",
  company: "/directory/companies",
  group: "/directory/groups",
  education: "/directory/education",
  person: "/directory/people",
  news: "/news",
  job: "/jobs",
  project: "/directory/projects",
  product: "/directory/products",
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
  relation?: string;
}

/**
 * Prepare resolved references for client-side rendering
 * Call this in your loader and pass result to RichMarkdown component
 * Only includes visible entities (respects visibility settings)
 */
export async function prepareRefsForClient(
  content: string,
): Promise<Record<string, SerializedRef>> {
  const parsed = parseReferences(content);
  const texts = parsed.map((p) => p.text);
  const resolutions = await resolveReferences(texts);

  // Build relation map
  const relationMap = new Map<string, string | undefined>();
  for (const p of parsed) {
    if (p.relation && !relationMap.has(p.text)) {
      relationMap.set(p.text, p.relation);
    }
  }

  const result: Record<string, SerializedRef> = {};

  for (const [text, resolution] of resolutions) {
    if (resolution.resolved) {
      // Check visibility - only include visible entities
      const isVisible = await isEntityVisible(resolution.reference.type, resolution.reference.id);
      if (!isVisible) continue;

      result[text] = {
        text: resolution.reference.text,
        type: resolution.reference.type,
        slug: resolution.reference.slug,
        name: resolution.reference.name,
        relation: relationMap.get(text),
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
  targetId: number,
): Promise<RichReference[]> {
  const refs = await getIncomingReferences(targetType, targetId);
  const rich: RichReference[] = [];

  for (const ref of refs) {
    // Fetch the source entity to get its name/title and slug
    let name = ref.referenceText;
    let slug = "";

    switch (ref.sourceType) {
      case "event": {
        const [e] = await db
          .select({ title: events.title, slug: events.slug })
          .from(events)
          .where(eq(events.id, ref.sourceId));
        if (e) {
          name = e.title;
          slug = e.slug;
        }
        break;
      }
      case "company": {
        const [c] = await db
          .select({ name: companies.name, slug: companies.slug })
          .from(companies)
          .where(eq(companies.id, ref.sourceId));
        if (c) {
          name = c.name;
          slug = c.slug;
        }
        break;
      }
      case "group": {
        const [g] = await db
          .select({ name: groups.name, slug: groups.slug })
          .from(groups)
          .where(eq(groups.id, ref.sourceId));
        if (g) {
          name = g.name;
          slug = g.slug;
        }
        break;
      }
      case "education": {
        const [l] = await db
          .select({ name: education.name, slug: education.slug })
          .from(education)
          .where(eq(education.id, ref.sourceId));
        if (l) {
          name = l.name;
          slug = l.slug;
        }
        break;
      }
      case "person": {
        const [p] = await db
          .select({ name: people.name, slug: people.slug })
          .from(people)
          .where(eq(people.id, ref.sourceId));
        if (p) {
          name = p.name;
          slug = p.slug;
        }
        break;
      }
      case "news": {
        const [n] = await db
          .select({ title: news.title, slug: news.slug })
          .from(news)
          .where(eq(news.id, ref.sourceId));
        if (n) {
          name = n.title;
          slug = n.slug;
        }
        break;
      }
      case "job": {
        const [j] = await db
          .select({ title: jobs.title, slug: jobs.slug })
          .from(jobs)
          .where(eq(jobs.id, ref.sourceId));
        if (j && j.slug) {
          name = j.title;
          slug = j.slug;
        }
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

// Full event data for backlinks - matches Event & { dates: EventDate[] }
export type EventBacklinkData = {
  id: number;
  slug: string;
  title: string;
  description: string;
  location: string | null;
  link: string;
  organizer: string | null;
  coverImage: string | null;
  iconImage: string | null;
  requiresSignup: boolean;
  recurrenceRule: string | null;
  recurrenceEnd: Date | null;
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  createdAt: Date;
  updatedAt: Date;
  dates: Array<{ id: number; eventId: number; startDate: Date; endDate: Date | null }>;
};

export type DetailedBacklink =
  | { type: "event"; relation?: string; data: EventBacklinkData }
  | {
      type: "company";
      relation?: string;
      data: {
        id: number;
        slug: string;
        name: string;
        logo: string | null;
        location: string | null;
      };
    }
  | {
      type: "group";
      relation?: string;
      data: { id: number; slug: string; name: string; logo: string | null };
    }
  | {
      type: "education";
      relation?: string;
      data: { id: number; slug: string; name: string; logo: string | null; type: string | null };
    }
  | {
      type: "person";
      relation?: string;
      data: { id: number; slug: string; name: string; avatar: string | null };
    }
  | {
      type: "news";
      relation?: string;
      data: {
        id: number;
        slug: string;
        title: string;
        coverImage: string | null;
        excerpt: string | null;
        publishedAt: Date | null;
      };
    }
  | {
      type: "job";
      relation?: string;
      data: {
        id: number;
        slug: string;
        title: string;
        location: string | null;
        workplaceType: string | null;
      };
    }
  | {
      type: "project";
      relation?: string;
      data: { id: number; slug: string; name: string; logo: string | null; type: string };
    };

/**
 * Get detailed backlink data for rich display on detail pages
 */
export async function getDetailedBacklinks(
  targetType: ContentType,
  targetId: number,
): Promise<DetailedBacklink[]> {
  const refs = await getIncomingReferences(targetType, targetId);
  const backlinks: DetailedBacklink[] = [];
  const now = new Date();

  for (const ref of refs) {
    switch (ref.sourceType) {
      case "event": {
        const [event] = await db.select().from(events).where(eq(events.id, ref.sourceId));

        if (event) {
          // Get upcoming dates for this event
          const dates = await db
            .select()
            .from(eventDates)
            .where(and(eq(eventDates.eventId, event.id), gte(eventDates.startDate, now)))
            .orderBy(asc(eventDates.startDate));

          backlinks.push({
            type: "event",
            relation: ref.relation ?? undefined,
            data: { ...event, dates },
          });
        }
        break;
      }
      case "company": {
        const [company] = await db
          .select({
            id: companies.id,
            slug: companies.slug,
            name: companies.name,
            logo: companies.logo,
            location: companies.location,
            visible: companies.visible,
          })
          .from(companies)
          .where(eq(companies.id, ref.sourceId));

        // Only include visible companies
        if (company && company.visible) {
          backlinks.push({ type: "company", relation: ref.relation ?? undefined, data: company });
        }
        break;
      }
      case "group": {
        const [group] = await db
          .select({
            id: groups.id,
            slug: groups.slug,
            name: groups.name,
            logo: groups.logo,
            visible: groups.visible,
          })
          .from(groups)
          .where(eq(groups.id, ref.sourceId));

        // Only include visible groups
        if (group && group.visible) {
          backlinks.push({ type: "group", relation: ref.relation ?? undefined, data: group });
        }
        break;
      }
      case "education": {
        const [inst] = await db
          .select({
            id: education.id,
            slug: education.slug,
            name: education.name,
            logo: education.logo,
            type: education.type,
            visible: education.visible,
          })
          .from(education)
          .where(eq(education.id, ref.sourceId));

        // Only include visible education
        if (inst && inst.visible) {
          backlinks.push({ type: "education", relation: ref.relation ?? undefined, data: inst });
        }
        break;
      }
      case "person": {
        const [person] = await db
          .select({
            id: people.id,
            slug: people.slug,
            name: people.name,
            avatar: people.avatar,
            visible: people.visible,
          })
          .from(people)
          .where(eq(people.id, ref.sourceId));

        // Only include visible people
        if (person && person.visible) {
          backlinks.push({ type: "person", relation: ref.relation ?? undefined, data: person });
        }
        break;
      }
      case "news": {
        const [article] = await db
          .select({
            id: news.id,
            slug: news.slug,
            title: news.title,
            coverImage: news.coverImage,
            excerpt: news.excerpt,
            publishedAt: news.publishedAt,
          })
          .from(news)
          .where(eq(news.id, ref.sourceId));

        if (article) {
          backlinks.push({ type: "news", relation: ref.relation ?? undefined, data: article });
        }
        break;
      }
      case "job": {
        const [job] = await db
          .select({
            id: jobs.id,
            slug: jobs.slug,
            title: jobs.title,
            location: jobs.location,
            workplaceType: jobs.workplaceType,
          })
          .from(jobs)
          .where(eq(jobs.id, ref.sourceId));

        if (job && job.slug) {
          backlinks.push({ 
            type: "job", 
            relation: ref.relation ?? undefined, 
            data: {
              id: job.id,
              slug: job.slug,
              title: job.title,
              location: job.location,
              workplaceType: job.workplaceType,
            }
          });
        }
        break;
      }
      case "project": {
        const [project] = await db
          .select({
            id: projects.id,
            slug: projects.slug,
            name: projects.name,
            logo: projects.logo,
            type: projects.type,
          })
          .from(projects)
          .where(eq(projects.id, ref.sourceId));

        if (project) {
          backlinks.push({ type: "project", relation: ref.relation ?? undefined, data: project });
        }
        break;
      }
    }
  }

  return backlinks;
}
