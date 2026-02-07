import { generateSlug, makeSlugUnique } from "./slug";

interface GenerateEntitySlugOptions {
  name: string;
  excludeId?: number;
  getExistingSlugs: () => Promise<string[]>;
  getSlugForId: (id: number) => Promise<string | null>;
}

export async function generateEntitySlug({
  name,
  excludeId,
  getExistingSlugs,
  getSlugForId,
}: GenerateEntitySlugOptions): Promise<string> {
  const baseSlug = generateSlug(name);
  let existingSlugs = await getExistingSlugs();

  if (excludeId) {
    const currentSlug = await getSlugForId(excludeId);
    if (currentSlug) {
      existingSlugs = existingSlugs.filter((slug) => slug !== currentSlug);
    }
  }

  return makeSlugUnique(baseSlug, existingSlugs);
}

interface PaginatedSearchOptions<T> {
  searchQuery?: string;
  getSearchIds: (query: string) => number[];
  getAllWhenNoSearch: () => Promise<{ items: T[]; total: number }>;
  getByIdsWhenSearch: (ids: number[]) => Promise<{ items: T[]; total: number }>;
}

export async function getPaginatedBySearch<T>({
  searchQuery,
  getSearchIds,
  getAllWhenNoSearch,
  getByIdsWhenSearch,
}: PaginatedSearchOptions<T>): Promise<{ items: T[]; total: number }> {
  if (!searchQuery || !searchQuery.trim()) {
    return getAllWhenNoSearch();
  }

  const matchingIds = getSearchIds(searchQuery);
  if (matchingIds.length === 0) {
    return { items: [], total: 0 };
  }

  return getByIdsWhenSearch(matchingIds);
}
