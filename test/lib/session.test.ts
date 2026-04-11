import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { users, sessions } from "~/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSession } from "~/lib/auth.server";
import { sessionStorage, requireAuth, getOptionalUser, logout } from "~/lib/session.server";

// =============================================================================
// Helpers
// =============================================================================

async function seedUser(
  email = "test@example.com",
  password = "password123",
  role: "admin" | "regular" = "admin",
) {
  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({ email, passwordHash, role }).returning();
  return user;
}

/** Build a Request with a signed session cookie containing the given sessionId */
async function buildRequest(sessionId?: string): Promise<Request> {
  const session = await sessionStorage.getSession();
  if (sessionId) {
    session.set("sessionId", sessionId);
  }
  const cookie = await sessionStorage.commitSession(session);
  return new Request("http://localhost/manage", {
    headers: { Cookie: cookie },
  });
}

/** Build a Request with no cookie at all */
function buildBareRequest(): Request {
  return new Request("http://localhost/manage");
}

// =============================================================================
// requireAuth
// =============================================================================

describe("requireAuth", () => {
  it("throws redirect when there is no cookie", async () => {
    const req = buildBareRequest();

    try {
      await requireAuth(req);
      expect.fail("should have thrown");
    } catch (e) {
      // react-router's redirect() throws a Response
      expect(e).toBeInstanceOf(Response);
      const res = e as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/manage/login");
    }
  });

  it("throws redirect when session cookie has no sessionId", async () => {
    const req = await buildRequest(); // no sessionId set

    try {
      await requireAuth(req);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      const res = e as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/manage/login");
    }
  });

  it("throws redirect when sessionId points to non-existent session", async () => {
    const req = await buildRequest("nonexistent-session-id");

    try {
      await requireAuth(req);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      const res = e as Response;
      expect(res.status).toBe(302);
      // Should also set a cookie to destroy the session
      expect(res.headers.get("Set-Cookie")).toBeTruthy();
    }
  });

  it("returns user data for a valid session", async () => {
    const user = await seedUser();
    const sessionId = await createSession(user.id);
    const req = await buildRequest(sessionId);

    const result = await requireAuth(req);

    expect(result.user.id).toBe(user.id);
    expect(result.user.email).toBe("test@example.com");
    expect(result.session.id).toBe(sessionId);
  });
});

// =============================================================================
// getOptionalUser
// =============================================================================

describe("getOptionalUser", () => {
  it("returns null when there is no cookie", async () => {
    const req = buildBareRequest();
    const result = await getOptionalUser(req);
    expect(result).toBeNull();
  });

  it("returns null when session cookie has no sessionId", async () => {
    const req = await buildRequest();
    const result = await getOptionalUser(req);
    expect(result).toBeNull();
  });

  it("returns null for an invalid/expired session", async () => {
    const user = await seedUser();
    const sessionId = await createSession(user.id);

    // Expire the session
    const pastDate = new Date(Date.now() - 1000);
    await db.update(sessions).set({ expiresAt: pastDate }).where(eq(sessions.id, sessionId));

    const req = await buildRequest(sessionId);
    const result = await getOptionalUser(req);
    expect(result).toBeNull();
  });

  it("returns the user for a valid session", async () => {
    const user = await seedUser();
    const sessionId = await createSession(user.id);
    const req = await buildRequest(sessionId);

    const result = await getOptionalUser(req);

    expect(result).not.toBeNull();
    expect(result!.user.id).toBe(user.id);
    expect(result!.user.email).toBe("test@example.com");
  });
});

// =============================================================================
// logout
// =============================================================================

describe("logout", () => {
  it("invalidates the session, destroys the cookie, and redirects", async () => {
    const user = await seedUser();
    const sessionId = await createSession(user.id);
    const req = await buildRequest(sessionId);

    let response: Response;
    try {
      response = await logout(req);
      // logout may return a Response directly via redirect()
    } catch (e) {
      // or throw it (react-router redirect throws)
      expect(e).toBeInstanceOf(Response);
      response = e as Response;
    }

    // Should redirect to login
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/manage/login");

    // Should have Set-Cookie header to clear the cookie
    expect(response.headers.get("Set-Cookie")).toBeTruthy();

    // Session should be deleted from DB
    const row = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row).toBeUndefined();
  });

  it("handles logout when there is no session gracefully", async () => {
    const req = buildBareRequest();

    let response: Response;
    try {
      response = await logout(req);
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      response = e as Response;
    }

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/manage/login");
  });
});
