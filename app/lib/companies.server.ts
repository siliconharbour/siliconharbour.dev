import { db } from "~/db";
import { companies, type Company, type NewCompany } from "~/db/schema";
import { eq, desc, asc, count, inArray, and, isNotNull } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";
import { searchContentIds } from "./search.server";

export interface PaginatedCompanies {
  items: Company[];
  total: number;
}

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: companies.slug }).from(companies);
  return rows.map((r) => r.slug);
}

export async function generateCompanySlug(name: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(name);
  let existingSlugs = await getExistingSlugs();

  if (excludeId) {
    const current = await db
      .select({ slug: companies.slug })
      .from(companies)
      .where(eq(companies.id, excludeId))
      .get();
    if (current) {
      existingSlugs = existingSlugs.filter((s) => s !== current.slug);
    }
  }

  return makeSlugUnique(baseSlug, existingSlugs);
}

export async function createCompany(company: Omit<NewCompany, "slug">): Promise<Company> {
  const slug = await generateCompanySlug(company.name);
  const [newCompany] = await db
    .insert(companies)
    .values({ ...company, slug })
    .returning();

  await syncReferences("company", newCompany.id, newCompany.description);

  return newCompany;
}

export async function updateCompany(
  id: number,
  company: Partial<Omit<NewCompany, "slug">>,
): Promise<Company | null> {
  let updateData: Partial<NewCompany> = { ...company, updatedAt: new Date() };

  if (company.name) {
    updateData.slug = await generateCompanySlug(company.name, id);
  }

  const [updated] = await db
    .update(companies)
    .set(updateData)
    .where(eq(companies.id, id))
    .returning();

  if (!updated) return null;

  if (company.description) {
    await syncReferences("company", id, company.description);
  }

  return updated;
}

export async function deleteCompany(id: number): Promise<boolean> {
  await db.delete(companies).where(eq(companies.id, id));
  return true;
}

export async function getCompanyById(id: number): Promise<Company | null> {
  return db.select().from(companies).where(eq(companies.id, id)).get() ?? null;
}

export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  return db.select().from(companies).where(eq(companies.slug, slug)).get() ?? null;
}

export async function getCompanyByName(name: string): Promise<Company | null> {
  // Case-insensitive search by lowercasing both sides
  const all = await db.select().from(companies);
  const nameLower = name.toLowerCase();
  return all.find((c) => c.name.toLowerCase() === nameLower) ?? null;
}

export async function getAllCompanies(includeHidden: boolean = false): Promise<Company[]> {
  if (includeHidden) {
    return db.select().from(companies).orderBy(asc(companies.name));
  }
  return db
    .select()
    .from(companies)
    .where(eq(companies.visible, true))
    .orderBy(asc(companies.name));
}

export async function getHiddenCompanies(): Promise<Company[]> {
  return db
    .select()
    .from(companies)
    .where(eq(companies.visible, false))
    .orderBy(desc(companies.createdAt));
}

export async function getHiddenCompaniesCount(): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(companies)
    .where(eq(companies.visible, false));
  return total;
}

/**
 * Get a deterministic "random" selection of companies based on a daily seed.
 * Only returns companies that have logos for better visual presentation.
 * The same seed will always return the same companies in the same order.
 */
export async function getRandomCompanies(count: number, seed?: number): Promise<Company[]> {
  // Default seed is today's date as YYYYMMDD
  const dateSeed = seed ?? parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ""), 10);

  // Get all visible companies with logos
  const allCompanies = await db
    .select()
    .from(companies)
    .where(and(eq(companies.visible, true), isNotNull(companies.logo)));

  if (allCompanies.length <= count) {
    return allCompanies;
  }

  // Use a simple seeded shuffle: hash each id with the seed and sort by that
  // Knuth multiplicative hash for good distribution
  const shuffled = allCompanies
    .map((c) => ({
      company: c,
      hash: ((c.id + dateSeed) * 2654435761) >>> 0, // unsigned 32-bit
    }))
    .sort((a, b) => a.hash - b.hash)
    .slice(0, count)
    .map((x) => x.company);

  return shuffled;
}

export async function getVisibleCompaniesCount(): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(companies)
    .where(eq(companies.visible, true));
  return total;
}

export async function hideAllVisibleCompanies(): Promise<number> {
  const result = await db
    .update(companies)
    .set({ visible: false, updatedAt: new Date() })
    .where(eq(companies.visible, true));
  return result.changes;
}

export async function getPaginatedCompanies(
  limit: number,
  offset: number,
  searchQuery?: string,
  includeHidden: boolean = false,
): Promise<PaginatedCompanies> {
  const visibilityFilter = includeHidden ? undefined : eq(companies.visible, true);

  // If searching, use FTS5
  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("company", searchQuery);

    if (matchingIds.length === 0) {
      return { items: [], total: 0 };
    }

    const whereClause = visibilityFilter
      ? and(inArray(companies.id, matchingIds), visibilityFilter)
      : inArray(companies.id, matchingIds);

    const items = await db
      .select()
      .from(companies)
      .where(whereClause)
      .orderBy(asc(companies.name))
      .limit(limit)
      .offset(offset);

    const allMatching = await db.select({ id: companies.id }).from(companies).where(whereClause);

    return { items, total: allMatching.length };
  }

  // No search - get total count and paginated items
  const [{ total }] = await db.select({ total: count() }).from(companies).where(visibilityFilter);

  const items = await db
    .select()
    .from(companies)
    .where(visibilityFilter)
    .orderBy(asc(companies.name))
    .limit(limit)
    .offset(offset);

  return { items, total };
}

// =============================================================================
// Fuzzy company matching for GitHub import
// =============================================================================

/**
 * Normalize a company name for fuzzy matching.
 * Removes common suffixes, punctuation, and normalizes whitespace.
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'"]/g, "")
    .replace(/\s+(inc|llc|ltd|co|corp|corporation|limited|incorporated)\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate simple similarity score between two strings.
 * Returns a number between 0 and 1, where 1 is exact match.
 */
function similarityScore(a: string, b: string): number {
  const normA = normalizeCompanyName(a);
  const normB = normalizeCompanyName(b);

  // Exact match after normalization
  if (normA === normB) return 1;

  // One contains the other (boost score for significant overlap)
  if (normA.includes(normB) || normB.includes(normA)) {
    const shorter = normA.length < normB.length ? normA : normB;
    const longer = normA.length < normB.length ? normB : normA;
    // Give higher scores for longer partial matches
    const ratio = shorter.length / longer.length;
    // If it's a prefix match (shorter is at start of longer), boost significantly
    if (longer.startsWith(shorter)) {
      return 0.7 + ratio * 0.3; // Prefix matches get 0.7-1.0
    }
    // Otherwise, still give reasonable score for containment
    return ratio >= 0.5 ? 0.6 + ratio * 0.3 : ratio;
  }

  // Word overlap - filter out very short words
  const wordsA = new Set(normA.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(normB.split(" ").filter((w) => w.length > 2));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));

  // If no significant words overlap, try starts-with matching on words
  if (intersection.length === 0) {
    const wordsAArr = [...wordsA];
    const wordsBArr = [...wordsB];
    for (const wa of wordsAArr) {
      for (const wb of wordsBArr) {
        if (wa.startsWith(wb) || wb.startsWith(wa)) {
          const shorter = wa.length < wb.length ? wa : wb;
          const longer = wa.length < wb.length ? wb : wa;
          if (shorter.length >= 4 && shorter.length / longer.length > 0.6) {
            return 0.6; // Partial word match
          }
        }
      }
    }
  }

  const union = new Set([...wordsA, ...wordsB]);
  if (union.size === 0) return 0;

  // Weight by how many significant words matched
  const score = intersection.length / union.size;

  // Bonus if all words from the shorter name are in the longer
  const shorterWords = wordsA.size < wordsB.size ? wordsA : wordsB;
  const longerWords = wordsA.size < wordsB.size ? wordsB : wordsA;
  const allShorterInLonger = [...shorterWords].every((w) => longerWords.has(w));

  return allShorterInLonger ? Math.min(1, score + 0.3) : score;
}

/**
 * Find the best matching company by name (fuzzy match).
 * Returns the company if similarity is above threshold (0.6).
 */
export async function findCompanyByFuzzyName(searchName: string): Promise<Company | null> {
  const allCompanies = await getAllCompanies();

  let bestMatch: Company | null = null;
  let bestScore = 0;
  const threshold = 0.6;

  for (const company of allCompanies) {
    const score = similarityScore(searchName, company.name);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = company;
    }
  }

  return bestMatch;
}

/**
 * Parse a GitHub company field to extract company name and optional GitHub org URL.
 *
 * Formats:
 * - "@orgname" -> { name: "orgname", githubOrg: "https://github.com/orgname" }
 * - "https://github.com/orgname" -> { name: "orgname", githubOrg: "https://github.com/orgname" }
 * - "Company Name" -> { name: "Company Name", githubOrg: null }
 */
export function parseGitHubCompanyField(company: string): {
  name: string;
  githubOrg: string | null;
} {
  const trimmed = company.trim();

  // @orgname format
  if (trimmed.startsWith("@")) {
    const orgName = trimmed.slice(1);
    return {
      name: orgName,
      githubOrg: `https://github.com/${orgName}`,
    };
  }

  // GitHub URL format
  const githubUrlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/\s]+)/i);
  if (githubUrlMatch) {
    return {
      name: githubUrlMatch[1],
      githubOrg: `https://github.com/${githubUrlMatch[1]}`,
    };
  }

  // Plain company name
  return {
    name: trimmed,
    githubOrg: null,
  };
}

/**
 * Extract company name from a bio string like "Staff Engineer at CoLab Software".
 * Returns the company name if found, null otherwise.
 */
export function extractCompanyFromBio(bio: string): string | null {
  // Pattern: "Role at Company" or "works at Company" etc.
  const patterns = [
    /(?:^|\s)at\s+([A-Z][A-Za-z0-9\s&.,']+?)(?:\.|,|$|\s*\()/i, // "... at Company Name"
    /(?:working|work|employed)\s+(?:at|for)\s+([A-Z][A-Za-z0-9\s&.,']+?)(?:\.|,|$)/i, // "working at Company"
  ];

  for (const pattern of patterns) {
    const match = bio.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}
