import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "~/db";
import { oauthClients, oauthTokens, users } from "~/db/schema";
import { eq } from "drizzle-orm";
import {
  createAuthorizationCode,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  oauthTokenVerifier,
  registerClient,
  validateScopes,
} from "~/mcp/oauth.server";

describe("MCP OAuth", () => {
  it("registers public clients with exact redirect URIs", async () => {
    const client = await registerClient({
      client_name: "Codex",
      redirect_uris: ["http://127.0.0.1:4567/callback"],
    });
    expect(client).toMatchObject({
      client_name: "Codex",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
    });
    await expect(
      registerClient({ client_name: "Bad", redirect_uris: ["http://example.com/callback"] }),
    ).rejects.toMatchObject({ code: "invalid_client_metadata" });
    await expect(
      registerClient({
        client_name: "Too many",
        redirect_uris: Array.from(
          { length: 11 },
          (_, index) => `https://example.com/callback/${index}`,
        ),
      }),
    ).rejects.toMatchObject({ code: "invalid_client_metadata" });
  });

  it("only grants write scope to admins", () => {
    expect(validateScopes("mcp:read mcp:write", "admin")).toEqual(["mcp:read", "mcp:write"]);
    expect(() => validateScopes("mcp:write", "regular")).toThrow("not permitted");
    expect(() => validateScopes("unknown", "admin")).toThrow("not permitted");
  });

  it("exchanges a PKCE code once, verifies access, and rotates refresh tokens", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "admin@example.com", passwordHash: "unused", role: "admin" })
      .returning();
    const client = await registerClient({
      client_name: "Codex",
      redirect_uris: ["http://127.0.0.1:4567/callback"],
    });
    const verifier = "v".repeat(64);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const code = await createAuthorizationCode({
      userId: user.id,
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      scopes: ["mcp:read", "mcp:write"],
      codeChallenge: challenge,
      resource: "http://localhost:3000/mcp",
    });
    const input = {
      code,
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      codeVerifier: verifier,
      resource: "http://localhost:3000/mcp",
    };
    const tokens = await exchangeAuthorizationCode(input);
    await expect(exchangeAuthorizationCode(input)).rejects.toMatchObject({ code: "invalid_grant" });
    await expect(oauthTokenVerifier.verifyAccessToken(tokens.access_token)).resolves.toMatchObject({
      clientId: client.client_id,
      scopes: ["mcp:read", "mcp:write"],
      extra: { userId: user.id, role: "admin" },
    });
    const rotated = await exchangeRefreshToken({
      refreshToken: tokens.refresh_token,
      clientId: client.client_id,
      resource: "http://localhost:3000/mcp",
    });
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    await expect(
      exchangeRefreshToken({
        refreshToken: tokens.refresh_token,
        clientId: client.client_id,
        resource: "http://localhost:3000/mcp",
      }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    await expect(oauthTokenVerifier.verifyAccessToken(rotated.access_token)).rejects.toMatchObject({
      code: "invalid_token",
    });
    await expect(
      exchangeRefreshToken({
        refreshToken: rotated.refresh_token,
        clientId: client.client_id,
        resource: "http://localhost:3000/mcp",
      }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("rejects pending and active write grants after an admin is demoted", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "demoted@example.com", passwordHash: "unused", role: "admin" })
      .returning();
    const client = await registerClient({
      client_name: "Codex",
      redirect_uris: ["http://127.0.0.1:4567/callback"],
    });
    const verifier = "d".repeat(64);
    const createCode = () =>
      createAuthorizationCode({
        userId: user.id,
        clientId: client.client_id,
        redirectUri: client.redirect_uris[0],
        scopes: ["mcp:read", "mcp:write"],
        codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
        resource: "http://localhost:3000/mcp",
      });
    const firstCode = await createCode();
    const tokens = await exchangeAuthorizationCode({
      code: firstCode,
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      codeVerifier: verifier,
      resource: "http://localhost:3000/mcp",
    });
    const pendingCode = await createCode();

    await db.update(users).set({ role: "regular" }).where(eq(users.id, user.id));

    await expect(oauthTokenVerifier.verifyAccessToken(tokens.access_token)).rejects.toMatchObject({
      code: "invalid_token",
    });
    await expect(
      exchangeRefreshToken({
        refreshToken: tokens.refresh_token,
        clientId: client.client_id,
        resource: "http://localhost:3000/mcp",
      }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    await expect(
      exchangeAuthorizationCode({
        code: pendingCode,
        clientId: client.client_id,
        redirectUri: client.redirect_uris[0],
        codeVerifier: verifier,
        resource: "http://localhost:3000/mcp",
      }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("rejects access tokens issued for another resource", async () => {
    const token = "wrong-audience-token";
    const [user] = await db
      .insert(users)
      .values({ email: "audience@example.com", passwordHash: "unused", role: "admin" })
      .returning();
    await db.insert(oauthClients).values({
      id: "audience-client",
      name: "Audience test",
      redirectUris: '["https://example.com/callback"]',
    });
    await db.insert(oauthTokens).values({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      tokenType: "access",
      userId: user.id,
      clientId: "audience-client",
      familyId: "audience-family",
      scopes: "mcp:read",
      resource: "https://other.example/mcp",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(oauthTokenVerifier.verifyAccessToken(token)).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("allows only one concurrent authorization-code exchange", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "admin@example.com", passwordHash: "unused", role: "admin" })
      .returning();
    const client = await registerClient({
      client_name: "Codex",
      redirect_uris: ["http://127.0.0.1:4567/callback"],
    });
    const verifier = "c".repeat(64);
    const code = await createAuthorizationCode({
      userId: user.id,
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      scopes: ["mcp:read"],
      codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
      resource: "http://localhost:3000/mcp",
    });
    const exchange = () =>
      exchangeAuthorizationCode({
        code,
        clientId: client.client_id,
        redirectUri: client.redirect_uris[0],
        codeVerifier: verifier,
        resource: "http://localhost:3000/mcp",
      });

    const results = await Promise.allSettled([exchange(), exchange()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("allows only one concurrent refresh-token rotation", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "admin@example.com", passwordHash: "unused", role: "admin" })
      .returning();
    const client = await registerClient({
      client_name: "Codex",
      redirect_uris: ["http://127.0.0.1:4567/callback"],
    });
    const verifier = "r".repeat(64);
    const code = await createAuthorizationCode({
      userId: user.id,
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      scopes: ["mcp:read"],
      codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
      resource: "http://localhost:3000/mcp",
    });
    const tokens = await exchangeAuthorizationCode({
      code,
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      codeVerifier: verifier,
      resource: "http://localhost:3000/mcp",
    });
    const rotate = () =>
      exchangeRefreshToken({
        refreshToken: tokens.refresh_token,
        clientId: client.client_id,
        resource: "http://localhost:3000/mcp",
      });

    const results = await Promise.allSettled([rotate(), rotate()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});
