import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { users, sessions } from "~/db/schema";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  invalidateSession,
  getUserByEmail,
  login,
} from "~/lib/auth.server";

// =============================================================================
// Helper: insert a test user with a known password
// =============================================================================

async function seedUser(
  email = "test@example.com",
  password = "password123",
  role: "admin" | "regular" = "admin",
) {
  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({ email, passwordHash, role }).returning();
  return { user, password };
}

// =============================================================================
// hashPassword / verifyPassword
// =============================================================================

describe("hashPassword / verifyPassword", () => {
  it("correct password verifies", async () => {
    const hash = await hashPassword("secret");
    expect(await verifyPassword("secret", hash)).toBe(true);
  });

  it("wrong password does not verify", async () => {
    const hash = await hashPassword("secret");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

// =============================================================================
// createSession
// =============================================================================

describe("createSession", () => {
  it("creates a session row and returns the session ID", async () => {
    const { user } = await seedUser();

    const sessionId = await createSession(user.id);
    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBe(64); // 32 random bytes -> 64 hex chars

    const row = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();

    expect(row).toBeDefined();
    expect(row!.userId).toBe(user.id);
  });

  it("sets expiry approximately 30 days from now", async () => {
    const { user } = await seedUser();
    const before = Date.now();
    const sessionId = await createSession(user.id);
    const after = Date.now();

    const row = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const expiresMs = row!.expiresAt.getTime();

    // Expiry should be ~30 days from the time range [before, after]
    expect(expiresMs).toBeGreaterThanOrEqual(before + thirtyDaysMs - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + thirtyDaysMs + 1000);
  });
});

// =============================================================================
// validateSession
// =============================================================================

describe("validateSession", () => {
  it("returns user data for a valid session", async () => {
    const { user } = await seedUser();
    const sessionId = await createSession(user.id);

    const result = await validateSession(sessionId);

    expect(result).not.toBeNull();
    expect(result!.user.id).toBe(user.id);
    expect(result!.user.email).toBe("test@example.com");
    expect(result!.user.role).toBe("admin");
    expect(result!.session.id).toBe(sessionId);
  });

  it("returns null for a non-existent session", async () => {
    const result = await validateSession("nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns null and deletes an expired session", async () => {
    const { user } = await seedUser();
    const sessionId = await createSession(user.id);

    // Manually set expiresAt to the past
    const pastDate = new Date(Date.now() - 1000);
    await db.update(sessions).set({ expiresAt: pastDate }).where(eq(sessions.id, sessionId));

    const result = await validateSession(sessionId);
    expect(result).toBeNull();

    // Session row should have been deleted
    const row = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row).toBeUndefined();
  });
});

// =============================================================================
// invalidateSession
// =============================================================================

describe("invalidateSession", () => {
  it("removes the session from the database", async () => {
    const { user } = await seedUser();
    const sessionId = await createSession(user.id);

    // Confirm it exists
    let row = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row).toBeDefined();

    await invalidateSession(sessionId);

    row = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row).toBeUndefined();
  });

  it("does not throw for a non-existent session", async () => {
    await expect(invalidateSession("no-such-id")).resolves.toBeUndefined();
  });
});

// =============================================================================
// getUserByEmail
// =============================================================================

describe("getUserByEmail", () => {
  it("finds an existing user", async () => {
    await seedUser("alice@example.com");

    const user = await getUserByEmail("alice@example.com");
    expect(user).toBeDefined();
    expect(user!.email).toBe("alice@example.com");
  });

  it("returns undefined for a non-existent email", async () => {
    const user = await getUserByEmail("nobody@example.com");
    expect(user).toBeUndefined();
  });
});

// =============================================================================
// login
// =============================================================================

describe("login", () => {
  it("returns session and user with correct credentials", async () => {
    await seedUser("admin@example.com", "correct-pass", "admin");

    const result = await login("admin@example.com", "correct-pass");

    expect(result).not.toBeNull();
    expect(result!.user.email).toBe("admin@example.com");
    expect(typeof result!.sessionId).toBe("string");

    // Session row should exist in DB
    const row = await db.select().from(sessions).where(eq(sessions.id, result!.sessionId)).get();
    expect(row).toBeDefined();
  });

  it("returns null for wrong password", async () => {
    await seedUser("admin@example.com", "correct-pass");

    const result = await login("admin@example.com", "wrong-pass");
    expect(result).toBeNull();
  });

  it("returns null for non-existent email", async () => {
    const result = await login("nobody@example.com", "any-pass");
    expect(result).toBeNull();
  });

  it("no user enumeration: wrong email and wrong password both return null", async () => {
    await seedUser("real@example.com", "real-pass");

    const wrongEmail = await login("fake@example.com", "real-pass");
    const wrongPass = await login("real@example.com", "wrong-pass");

    // Both cases return the same null — no way to distinguish
    expect(wrongEmail).toBeNull();
    expect(wrongPass).toBeNull();
  });
});
