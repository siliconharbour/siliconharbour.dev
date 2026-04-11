import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { rateLimits } from "~/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, getRateLimitStatus } from "~/lib/ratelimit.server";

// =============================================================================
// checkRateLimit
// =============================================================================

describe("checkRateLimit", () => {
  it("first request is allowed with remaining = limit - 1", async () => {
    const result = await checkRateLimit("test-key", 5, 60);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.current).toBe(1);
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it("requests up to the limit are all allowed, remaining decrements", async () => {
    const limit = 3;
    const results = [];

    for (let i = 0; i < limit; i++) {
      results.push(await checkRateLimit("decrement-key", limit, 60));
    }

    expect(results[0].allowed).toBe(true);
    expect(results[0].remaining).toBe(2);
    expect(results[0].current).toBe(1);

    expect(results[1].allowed).toBe(true);
    expect(results[1].remaining).toBe(1);
    expect(results[1].current).toBe(2);

    expect(results[2].allowed).toBe(true);
    expect(results[2].remaining).toBe(0);
    expect(results[2].current).toBe(3);
  });

  it("request at limit+1 is not allowed", async () => {
    const limit = 2;

    await checkRateLimit("over-key", limit, 60);
    await checkRateLimit("over-key", limit, 60);

    const overLimit = await checkRateLimit("over-key", limit, 60);

    expect(overLimit.allowed).toBe(false);
    expect(overLimit.remaining).toBe(0);
    expect(overLimit.current).toBe(2);
    // resetAt should be in the future
    expect(overLimit.resetAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("different keys are independent", async () => {
    await checkRateLimit("key-a", 1, 60);
    // key-a is now at limit

    const resultB = await checkRateLimit("key-b", 1, 60);
    expect(resultB.allowed).toBe(true);

    const resultA = await checkRateLimit("key-a", 1, 60);
    expect(resultA.allowed).toBe(false);
  });

  it("limit resets after window expires", async () => {
    const windowSeconds = 3600; // 1 hour window

    // Exhaust the limit
    await checkRateLimit("expire-key", 1, windowSeconds);
    const blocked = await checkRateLimit("expire-key", 1, windowSeconds);
    expect(blocked.allowed).toBe(false);

    // Manually manipulate the DB row to simulate an old window
    const now = Math.floor(Date.now() / 1000);
    const oldWindowStart = now - windowSeconds - 1; // definitely in the previous window
    await db
      .update(rateLimits)
      .set({
        windowStart: oldWindowStart,
        expiresAt: oldWindowStart + windowSeconds,
      })
      .where(eq(rateLimits.key, "expire-key"));

    // Now the next check should see a new window and allow
    const afterExpiry = await checkRateLimit("expire-key", 1, windowSeconds);
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.remaining).toBe(0); // limit=1, used 1
    expect(afterExpiry.current).toBe(1);
  });
});

// =============================================================================
// getRateLimitStatus
// =============================================================================

describe("getRateLimitStatus", () => {
  it("returns full allowance when no requests have been made", async () => {
    const status = await getRateLimitStatus("fresh-key", 10, 60);

    expect(status.allowed).toBe(true);
    expect(status.remaining).toBe(10);
    expect(status.current).toBe(0);
  });

  it("does not consume the limit", async () => {
    // Check status multiple times — should not change
    await getRateLimitStatus("readonly-key", 5, 60);
    await getRateLimitStatus("readonly-key", 5, 60);
    await getRateLimitStatus("readonly-key", 5, 60);

    const status = await getRateLimitStatus("readonly-key", 5, 60);
    expect(status.remaining).toBe(5);
    expect(status.current).toBe(0);
  });

  it("reflects consumed requests accurately", async () => {
    await checkRateLimit("mixed-key", 5, 60);
    await checkRateLimit("mixed-key", 5, 60);

    const status = await getRateLimitStatus("mixed-key", 5, 60);
    expect(status.allowed).toBe(true);
    expect(status.remaining).toBe(3);
    expect(status.current).toBe(2);
  });

  it("shows not allowed when limit is exhausted", async () => {
    await checkRateLimit("full-key", 1, 60);

    const status = await getRateLimitStatus("full-key", 1, 60);
    expect(status.allowed).toBe(false);
    expect(status.remaining).toBe(0);
    expect(status.current).toBe(1);
  });
});
