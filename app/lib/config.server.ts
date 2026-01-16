import { db } from "~/db";
import { siteConfig, sectionKeys, type SectionKey } from "~/db/schema";
import { eq } from "drizzle-orm";

// Section visibility configuration
export type SectionVisibility = Record<SectionKey, boolean>;

const VISIBILITY_PREFIX = "section_visible_";

/**
 * Get visibility setting for a single section
 */
export async function isSectionVisible(section: SectionKey): Promise<boolean> {
  const key = `${VISIBILITY_PREFIX}${section}`;
  const result = await db
    .select()
    .from(siteConfig)
    .where(eq(siteConfig.key, key))
    .get();
  
  // Default to visible if not set
  if (!result) return true;
  return result.value === "true";
}

/**
 * Get visibility settings for all sections
 */
export async function getSectionVisibility(): Promise<SectionVisibility> {
  const results = await db
    .select()
    .from(siteConfig)
    .all();
  
  const configMap = new Map(results.map(r => [r.key, r.value]));
  
  const visibility: SectionVisibility = {} as SectionVisibility;
  for (const section of sectionKeys) {
    const key = `${VISIBILITY_PREFIX}${section}`;
    const value = configMap.get(key);
    // Default to visible if not set
    visibility[section] = value === undefined ? true : value === "true";
  }
  
  return visibility;
}

/**
 * Set visibility for a single section
 */
export async function setSectionVisibility(
  section: SectionKey,
  visible: boolean
): Promise<void> {
  const key = `${VISIBILITY_PREFIX}${section}`;
  await db
    .insert(siteConfig)
    .values({ key, value: String(visible) })
    .onConflictDoUpdate({
      target: siteConfig.key,
      set: { value: String(visible), updatedAt: new Date() },
    });
}

/**
 * Set visibility for multiple sections at once
 */
export async function updateSectionVisibility(
  updates: Partial<SectionVisibility>
): Promise<void> {
  for (const [section, visible] of Object.entries(updates)) {
    if (sectionKeys.includes(section as SectionKey)) {
      await setSectionVisibility(section as SectionKey, visible as boolean);
    }
  }
}

/**
 * Get list of visible sections (for filtering nav items, etc.)
 */
export async function getVisibleSections(): Promise<SectionKey[]> {
  const visibility = await getSectionVisibility();
  return sectionKeys.filter(section => visibility[section]);
}
