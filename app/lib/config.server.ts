import { db } from "~/db";
import {
  siteConfig,
  sectionKeys,
  type SectionKey,
  commentableKeys,
  type CommentableKey,
} from "~/db/schema";
import { eq } from "drizzle-orm";

// Section visibility configuration
export type SectionVisibility = Record<SectionKey, boolean>;

const VISIBILITY_PREFIX = "section_visible_";

/**
 * Get visibility setting for a single section
 */
export async function isSectionVisible(section: SectionKey): Promise<boolean> {
  const key = `${VISIBILITY_PREFIX}${section}`;
  const result = await db.select().from(siteConfig).where(eq(siteConfig.key, key)).get();

  // Default to visible if not set
  if (!result) return true;
  return result.value === "true";
}

/**
 * Get visibility settings for all sections
 */
export async function getSectionVisibility(): Promise<SectionVisibility> {
  const results = await db.select().from(siteConfig).all();

  const configMap = new Map(results.map((r) => [r.key, r.value]));

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
export async function setSectionVisibility(section: SectionKey, visible: boolean): Promise<void> {
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
export async function updateSectionVisibility(updates: Partial<SectionVisibility>): Promise<void> {
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
  return sectionKeys.filter((section) => visibility[section]);
}

// =============================================================================
// Comment visibility configuration
// =============================================================================

export type CommentVisibility = Record<CommentableKey, boolean>;

const COMMENT_VISIBILITY_PREFIX = "comments_enabled_";

/**
 * Check if comments are enabled for a specific content type
 */
export async function areCommentsEnabled(contentType: CommentableKey): Promise<boolean> {
  const key = `${COMMENT_VISIBILITY_PREFIX}${contentType}`;
  const result = await db.select().from(siteConfig).where(eq(siteConfig.key, key)).get();

  // Default to enabled if not set
  if (!result) return true;
  return result.value === "true";
}

/**
 * Get comment visibility settings for all commentable content types
 */
export async function getCommentVisibility(): Promise<CommentVisibility> {
  const results = await db.select().from(siteConfig).all();

  const configMap = new Map(results.map((r) => [r.key, r.value]));

  const visibility: CommentVisibility = {} as CommentVisibility;
  for (const contentType of commentableKeys) {
    const key = `${COMMENT_VISIBILITY_PREFIX}${contentType}`;
    const value = configMap.get(key);
    // Default to enabled if not set
    visibility[contentType] = value === undefined ? true : value === "true";
  }

  return visibility;
}

/**
 * Set comment visibility for a single content type
 */
export async function setCommentVisibility(
  contentType: CommentableKey,
  enabled: boolean,
): Promise<void> {
  const key = `${COMMENT_VISIBILITY_PREFIX}${contentType}`;
  await db
    .insert(siteConfig)
    .values({ key, value: String(enabled) })
    .onConflictDoUpdate({
      target: siteConfig.key,
      set: { value: String(enabled), updatedAt: new Date() },
    });
}

/**
 * Set comment visibility for multiple content types at once
 */
export async function updateCommentVisibility(updates: Partial<CommentVisibility>): Promise<void> {
  for (const [contentType, enabled] of Object.entries(updates)) {
    if (commentableKeys.includes(contentType as CommentableKey)) {
      await setCommentVisibility(contentType as CommentableKey, enabled as boolean);
    }
  }
}

// =============================================================================
// News global keywords
// =============================================================================

const NEWS_KEYWORDS_KEY = "news_global_keywords";

/**
 * Get the global keywords used for filtering news import sources.
 */
export async function getNewsGlobalKeywords(): Promise<string> {
  const result = await db.select().from(siteConfig).where(eq(siteConfig.key, NEWS_KEYWORDS_KEY)).get();
  return result?.value ?? "";
}

/**
 * Set the global keywords for news import filtering.
 */
export async function setNewsGlobalKeywords(keywords: string): Promise<void> {
  await db
    .insert(siteConfig)
    .values({ key: NEWS_KEYWORDS_KEY, value: keywords })
    .onConflictDoUpdate({
      target: siteConfig.key,
      set: { value: keywords, updatedAt: new Date() },
    });
}

// =============================================================================
// Discord configuration
// =============================================================================

const DISCORD_PREFIX = "discord_";
const DISCORD_BOT_TOKEN_KEY = `${DISCORD_PREFIX}bot_token`;

export interface DiscordConfig {
  /** Bot token used to authenticate against the Discord REST API. */
  botToken: string;
}

/**
 * Get Discord configuration. Destination channels are stored separately in the
 * discord_destinations table; see app/lib/discord-destinations.server.ts.
 */
export async function getDiscordConfig(): Promise<DiscordConfig> {
  const row = await db
    .select()
    .from(siteConfig)
    .where(eq(siteConfig.key, DISCORD_BOT_TOKEN_KEY))
    .get();
  return { botToken: row?.value ?? "" };
}

/**
 * Update Discord configuration (currently only the bot token).
 */
export async function updateDiscordConfig(config: Partial<DiscordConfig>): Promise<void> {
  if (typeof config.botToken !== "string") return;
  await db
    .insert(siteConfig)
    .values({ key: DISCORD_BOT_TOKEN_KEY, value: config.botToken })
    .onConflictDoUpdate({
      target: siteConfig.key,
      set: { value: config.botToken, updatedAt: new Date() },
    });
}
