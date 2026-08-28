import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "~/db";
import { users } from "~/db/schema";
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
  });
});
