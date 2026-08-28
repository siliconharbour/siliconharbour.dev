import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { db } from "~/db";
import { sessions, users } from "~/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "~/lib/auth.server";
import { sessionStorage } from "~/lib/session.server";
import { oauthJson } from "~/mcp/oauth-http.server";
import { registerClient } from "~/mcp/oauth.server";
import { action as authorize, loader as loadAuthorization } from "~/routes/oauth.authorize";
import { action as register } from "~/routes/oauth.register";
import { action as exchangeToken } from "~/routes/oauth.token";

function routeArgs(request: Request) {
  const url = new URL(request.url);
  return {
    request,
    url,
    params: {},
    pattern: url.pathname,
    context: new RouterContextProvider(),
  };
}

async function sessionCookie(userId: number) {
  const session = await sessionStorage.getSession();
  const sessionId = await createSession(userId);
  session.set("sessionId", sessionId);
  return { cookie: await sessionStorage.commitSession(session), sessionId };
}

describe("MCP OAuth routes", () => {
  it("registers a client through the HTTP contract", async () => {
    const response = await register(
      routeArgs(new Request("http://localhost:3000/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Codex",
          redirect_uris: ["http://127.0.0.1:4567/callback"],
        }),
      })),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      client_name: "Codex",
      token_endpoint_auth_method: "none",
    });
  });

  it("returns protocol errors without leaking unexpected failures", async () => {
    const malformed = await register(
      routeArgs(new Request("http://localhost:3000/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      })),
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ error: "invalid_request" });

    const unsupported = await exchangeToken(
      routeArgs(new Request("http://localhost:3000/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "password" }),
      })),
    );
    expect(unsupported.status).toBe(400);
    await expect(unsupported.json()).resolves.toMatchObject({ error: "unsupported_grant_type" });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failed = await oauthJson(async () => {
      throw new Error("private database detail");
    });
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("private database detail");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("rejects oversized OAuth request bodies", async () => {
    const oversized = "x".repeat(33 * 1024);
    const registration = await register(
      routeArgs(
        new Request("http://localhost:3000/oauth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_name: oversized, redirect_uris: ["https://example.com"] }),
        }),
      ),
    );
    expect(registration.status).toBe(400);
    await expect(registration.json()).resolves.toMatchObject({ error: "invalid_request" });

    const token = await exchangeToken(
      routeArgs(
        new Request("http://localhost:3000/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "authorization_code", code: oversized }),
        }),
      ),
    );
    expect(token.status).toBe(400);
    await expect(token.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rate limits repeated dynamic client registrations", async () => {
    let response: Response | undefined;
    for (let index = 0; index < 21; index += 1) {
      response = await register(
        routeArgs(
          new Request("http://localhost:3000/oauth/register", {
            method: "POST",
            headers: {
              "CF-Connecting-IP": "192.0.2.1",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              client_name: `Client ${index}`,
              redirect_uris: ["https://example.com/callback"],
            }),
          }),
        ),
      );
    }
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBeTruthy();
  });

  it("completes login-backed consent and token exchange", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "admin@example.com", passwordHash: "unused", role: "admin" })
      .returning();
    const client = await registerClient({
      client_name: "Codex",
      redirect_uris: ["http://127.0.0.1:4567/callback"],
    });
    const verifier = "p".repeat(64);
    const query = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      response_type: "code",
      scope: "mcp:read mcp:write",
      state: "expected-state",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      resource: "http://localhost:3000/mcp",
    });
    const { cookie } = await sessionCookie(user.id);
    const authorizationRequest = new Request(
      `http://localhost:3000/oauth/authorize?${query}`,
      { headers: { Cookie: cookie } },
    );
    const loaded = await loadAuthorization(routeArgs(authorizationRequest));
    expect(loaded.data).toMatchObject({
      clientName: "Codex",
      scopes: ["mcp:read", "mcp:write"],
    });
    expect(loaded.data.redirectHost).toBe("127.0.0.1:4567");
    expect(loaded.init?.headers).toMatchObject({
      "Cache-Control": "no-store",
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
    });
    const consentCookie = new Headers(loaded.init?.headers).get("Set-Cookie")!;

    const consent = await authorize(
      routeArgs(new Request("http://localhost:3000/oauth/authorize", {
        method: "POST",
        headers: {
          Cookie: consentCookie,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          consent_nonce: loaded.data.consentNonce,
          decision: "allow",
        }),
      })),
    );
    expect(consent.status).toBe(302);
    const callback = new URL(consent.headers.get("location")!);
    expect(callback.searchParams.get("state")).toBe("expected-state");

    await expect(
      authorize(
        routeArgs(
          new Request("http://localhost:3000/oauth/authorize", {
            method: "POST",
            headers: {
              Cookie: consentCookie,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              consent_nonce: loaded.data.consentNonce,
              decision: "allow",
            }),
          }),
        ),
      ),
    ).rejects.toMatchObject({ status: 400 });

    const token = await exchangeToken(
      routeArgs(new Request("http://localhost:3000/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: callback.searchParams.get("code")!,
          client_id: client.client_id,
          redirect_uri: client.redirect_uris[0],
          code_verifier: verifier,
          resource: "http://localhost:3000/mcp",
        }),
      })),
    );
    expect(token.status).toBe(200);
    await expect(token.json()).resolves.toMatchObject({
      token_type: "Bearer",
      scope: "mcp:read mcp:write",
    });
  });

  it("preserves the authorization request when login expires before consent", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "expired@example.com", passwordHash: "unused", role: "admin" })
      .returning();
    const client = await registerClient({
      client_name: "Codex",
      redirect_uris: ["http://127.0.0.1:4567/callback"],
    });
    const params = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      response_type: "code",
      scope: "mcp:read",
      state: "preserved-state",
      code_challenge: createHash("sha256").update("e".repeat(64)).digest("base64url"),
      code_challenge_method: "S256",
      resource: "http://localhost:3000/mcp",
    });

    const { cookie, sessionId } = await sessionCookie(user.id);
    const loaded = await loadAuthorization(
      routeArgs(
        new Request(`http://localhost:3000/oauth/authorize?${params}`, {
          headers: { Cookie: cookie },
        }),
      ),
    );
    const consentCookie = new Headers(loaded.init?.headers).get("Set-Cookie")!;
    await db.delete(sessions).where(eq(sessions.id, sessionId));

    try {
      await authorize(
        routeArgs(new Request("http://localhost:3000/oauth/authorize", {
          method: "POST",
          headers: {
            Cookie: consentCookie,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            consent_nonce: loaded.data.consentNonce,
            decision: "allow",
          }),
        })),
      );
      expect.fail("expected login redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const location = (error as Response).headers.get("location")!;
      const returnTo = new URL(location, "http://localhost").searchParams.get("returnTo")!;
      expect(returnTo).toContain(`client_id=${encodeURIComponent(client.client_id)}`);
      expect(returnTo).toContain("state=preserved-state");
      expect(returnTo).not.toContain("decision=allow");
    }
  });
});
