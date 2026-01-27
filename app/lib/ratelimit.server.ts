import { db } from "~/db";
import { rateLimits } from "~/db/schema";
import { eq, lt } from "drizzle-orm";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  current: number;
}

/**
 * Check and increment rate limit for a given key.
 * Uses fixed time windows aligned to the window size.
 *
 * @param key - Unique identifier (e.g., "comment:abc123" where abc123 is IP hash)
 * @param limit - Maximum requests allowed in the window
 * @param windowSeconds - Window size in seconds (e.g., 1800 for 30 minutes)
 * @returns RateLimitResult with allowed status and remaining count
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  // Align to window boundary (e.g., if window is 1800s/30min, align to :00 or :30)
  const windowStart = now - (now % windowSeconds);
  const expiresAt = windowStart + windowSeconds;
  const resetAt = new Date(expiresAt * 1000);

  // Try to get existing record
  const existing = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();

  if (existing && existing.windowStart === windowStart) {
    // Same window - check if under limit
    if (existing.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        current: existing.count,
      };
    }

    // Increment count
    await db
      .update(rateLimits)
      .set({ count: existing.count + 1 })
      .where(eq(rateLimits.key, key));

    return {
      allowed: true,
      remaining: limit - existing.count - 1,
      resetAt,
      current: existing.count + 1,
    };
  }

  // New window or no record - insert/replace with count = 1
  await db
    .insert(rateLimits)
    .values({
      key,
      count: 1,
      windowStart,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: 1,
        windowStart,
        expiresAt,
      },
    });

  return {
    allowed: true,
    remaining: limit - 1,
    resetAt,
    current: 1,
  };
}

/**
 * Check rate limit without incrementing (for UI display).
 */
export async function getRateLimitStatus(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const expiresAt = windowStart + windowSeconds;
  const resetAt = new Date(expiresAt * 1000);

  const existing = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();

  if (existing && existing.windowStart === windowStart) {
    return {
      allowed: existing.count < limit,
      remaining: Math.max(0, limit - existing.count),
      resetAt,
      current: existing.count,
    };
  }

  // No record or different window - would be allowed
  return {
    allowed: true,
    remaining: limit,
    resetAt,
    current: 0,
  };
}

/**
 * Clean up expired rate limit entries.
 * Call this periodically (e.g., on each request or via cron).
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  const now = Math.floor(Date.now() / 1000);

  const result = await db.delete(rateLimits).where(lt(rateLimits.expiresAt, now));

  return result.changes;
}

/**
 * Create a rate limit key for comments by IP hash.
 */
export function commentRateLimitKey(ipHash: string): string {
  return `comment:${ipHash}`;
}

// Default rate limit settings for comments
export const COMMENT_RATE_LIMIT = 10; // 10 comments
export const COMMENT_RATE_WINDOW = 30 * 60; // per 30 minutes
