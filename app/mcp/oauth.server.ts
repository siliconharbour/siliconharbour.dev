import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { OAuthError, OAuthErrorCode, type AuthInfo } from "@modelcontextprotocol/server";
import { z } from "zod";
import { db } from "~/db";
import {
  oauthAuthorizationCodes,
  oauthClients,
  oauthConsentRequests,
  oauthTokens,
  users,
} from "~/db/schema";

export const MCP_SCOPES = ["mcp:read", "mcp:write"] as const;
const ACCESS_TOKEN_SECONDS = 60 * 60;
const REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 30;
const AUTHORIZATION_CODE_SECONDS = 5 * 60;
const CONSENT_REQUEST_SECONDS = 10 * 60;
const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 2048;
const MAX_REGISTERED_CLIENTS = 10_000;

export function getOAuthIssuerUrl(): URL {
  return new URL(
    process.env.OAUTH_ISSUER_URL ||
      process.env.SITE_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://siliconharbour.dev"
        : "http://localhost:3000"),
  );
}

export function getMcpResourceUrl(): URL {
  return new URL("/mcp", getOAuthIssuerUrl());
}

function opaqueValue(): string {
  return randomBytes(32).toString("base64url");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function serializeScopes(scopes: string[]): string {
  return [...new Set(scopes)].sort().join(" ");
}

function parseScopes(scopes: string): string[] {
  return scopes.split(/\s+/).filter(Boolean);
}

export function validateScopes(value: string | undefined, role: "regular" | "admin") {
  const requested = parseScopes(value || "mcp:read");
  if (
    requested.length === 0 ||
    requested.some((scope) => !MCP_SCOPES.includes(scope as (typeof MCP_SCOPES)[number])) ||
    (requested.includes("mcp:write") && role !== "admin")
  ) {
    throw new OAuthError(OAuthErrorCode.InvalidScope, "The requested scope is not permitted");
  }
  return [...new Set(requested)];
}

export function isValidRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

const clientRegistrationSchema = z.object({
  client_name: z.string().trim().min(1).max(200),
  redirect_uris: z
    .array(z.string().max(MAX_REDIRECT_URI_LENGTH).refine(isValidRedirectUri))
    .min(1)
    .max(MAX_REDIRECT_URIS),
});

export async function registerClient(input: unknown) {
  const parsed = clientRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    throw new OAuthError(OAuthErrorCode.InvalidClientMetadata, "Invalid client metadata");
  }
  if ((await db.$count(oauthClients)) >= MAX_REGISTERED_CLIENTS) {
    throw new OAuthError(
      OAuthErrorCode.TemporarilyUnavailable,
      "OAuth client registration capacity has been reached",
    );
  }

  const client = {
    id: `sh_${opaqueValue()}`,
    name: parsed.data.client_name,
    redirectUris: JSON.stringify([...new Set(parsed.data.redirect_uris)]),
  };
  await db.insert(oauthClients).values(client);
  return {
    client_id: client.id,
    client_name: client.name,
    redirect_uris: [...new Set(parsed.data.redirect_uris)],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

export async function getClient(clientId: string) {
  const client = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).get();
  if (!client) return null;
  return { ...client, redirectUris: JSON.parse(client.redirectUris) as string[] };
}

export async function validateAuthorizationRequest(
  params: URLSearchParams,
  role: "regular" | "admin",
) {
  const clientId = params.get("client_id") || "";
  const redirectUri = params.get("redirect_uri") || "";
  const client = await getClient(clientId);
  const resource = params.get("resource") || "";
  const codeChallenge = params.get("code_challenge") || "";

  if (
    clientId.length > 200 ||
    redirectUri.length > MAX_REDIRECT_URI_LENGTH ||
    resource.length > MAX_REDIRECT_URI_LENGTH ||
    (params.get("scope") || "").length > 200 ||
    (params.get("state") || "").length > 512
  ) {
    throw new OAuthError(OAuthErrorCode.InvalidRequest, "OAuth request parameter is too large");
  }

  if (!client || !client.redirectUris.includes(redirectUri)) {
    throw new OAuthError(OAuthErrorCode.InvalidClient, "Invalid OAuth client or redirect URI");
  }
  if (params.get("response_type") !== "code") {
    throw new OAuthError(
      OAuthErrorCode.UnsupportedResponseType,
      "Only the authorization code flow is supported",
    );
  }
  if (
    params.get("code_challenge_method") !== "S256" ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)
  ) {
    throw new OAuthError(
      OAuthErrorCode.InvalidRequest,
      "PKCE with the S256 challenge method is required",
    );
  }
  if (resource !== getMcpResourceUrl().toString()) {
    throw new OAuthError(OAuthErrorCode.InvalidTarget, "Invalid OAuth resource");
  }

  return {
    client,
    clientId,
    redirectUri,
    resource,
    codeChallenge,
    scopes: validateScopes(params.get("scope") || undefined, role),
    state: params.get("state") || "",
  };
}

export async function createAuthorizationCode(input: {
  userId: number;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  resource: string;
}) {
  const code = opaqueValue();
  await db.insert(oauthAuthorizationCodes).values({
    codeHash: hash(code),
    userId: input.userId,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    scopes: serializeScopes(input.scopes),
    codeChallenge: input.codeChallenge,
    resource: input.resource,
    expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_SECONDS * 1000),
  });
  return code;
}

export async function createConsentRequest(userId: number, params: Record<string, string>) {
  const nonce = opaqueValue();
  const now = new Date();
  await db.transaction((tx) => {
    tx.delete(oauthConsentRequests).where(lt(oauthConsentRequests.expiresAt, now)).run();
    tx.insert(oauthConsentRequests)
      .values({
        nonceHash: hash(nonce),
        userId,
        params: JSON.stringify(params),
        expiresAt: new Date(now.getTime() + CONSENT_REQUEST_SECONDS * 1000),
      })
      .run();
  });
  return nonce;
}

export async function consumeConsentRequest(nonce: string, userId: number) {
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(oauthConsentRequests)
      .where(eq(oauthConsentRequests.nonceHash, hash(nonce)))
      .get();
    if (!row || row.userId !== userId || row.expiresAt < new Date()) return null;
    tx.delete(oauthConsentRequests)
      .where(eq(oauthConsentRequests.nonceHash, row.nonceHash))
      .run();
    return JSON.parse(row.params) as Record<string, string>;
  });
}

function verifyPkce(verifier: string, challenge: string): boolean {
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

function createTokenGrant(input: {
  userId: number;
  clientId: string;
  scopes: string[];
  resource: string;
  familyId?: string;
}) {
  const accessToken = opaqueValue();
  const refreshToken = opaqueValue();
  const now = Date.now();
  const familyId = input.familyId || opaqueValue();
  const values = [
    {
      tokenHash: hash(accessToken),
      tokenType: "access",
      userId: input.userId,
      clientId: input.clientId,
      familyId,
      scopes: serializeScopes(input.scopes),
      resource: input.resource,
      expiresAt: new Date(now + ACCESS_TOKEN_SECONDS * 1000),
    },
    {
      tokenHash: hash(refreshToken),
      tokenType: "refresh",
      userId: input.userId,
      clientId: input.clientId,
      familyId,
      scopes: serializeScopes(input.scopes),
      resource: input.resource,
      expiresAt: new Date(now + REFRESH_TOKEN_SECONDS * 1000),
    },
  ] as const;
  return {
    values,
    response: {
      access_token: accessToken,
      token_type: "Bearer" as const,
      expires_in: ACCESS_TOKEN_SECONDS,
      refresh_token: refreshToken,
      scope: serializeScopes(input.scopes),
    },
  };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string;
}) {
  return db.transaction((tx) => {
    const result = tx
      .select({ code: oauthAuthorizationCodes, userRole: users.role })
      .from(oauthAuthorizationCodes)
      .innerJoin(users, eq(oauthAuthorizationCodes.userId, users.id))
      .where(eq(oauthAuthorizationCodes.codeHash, hash(input.code)))
      .get();
    const row = result?.code;
    if (
      !row ||
      row.expiresAt < new Date() ||
      row.clientId !== input.clientId ||
      row.redirectUri !== input.redirectUri ||
      row.resource !== input.resource ||
      !verifyPkce(input.codeVerifier, row.codeChallenge)
    ) {
      throw new OAuthError(OAuthErrorCode.InvalidGrant, "Invalid or expired authorization code");
    }
    if (parseScopes(row.scopes).includes("mcp:write") && result.userRole !== "admin") {
      throw new OAuthError(OAuthErrorCode.InvalidGrant, "Authorization grant is no longer permitted");
    }
    tx.delete(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.codeHash, row.codeHash))
      .run();
    const grant = createTokenGrant({
      userId: row.userId,
      clientId: row.clientId,
      scopes: parseScopes(row.scopes),
      resource: row.resource,
    });
    tx.insert(oauthTokens).values([...grant.values]).run();
    return grant.response;
  });
}

export async function exchangeRefreshToken(input: {
  refreshToken: string;
  clientId: string;
  resource: string;
}) {
  const result = db.transaction((tx) => {
    const selected = tx
      .select({ token: oauthTokens, userRole: users.role })
      .from(oauthTokens)
      .innerJoin(users, eq(oauthTokens.userId, users.id))
      .where(
        and(
          eq(oauthTokens.tokenHash, hash(input.refreshToken)),
          eq(oauthTokens.tokenType, "refresh"),
        ),
      )
      .get();
    const row = selected?.token;
    if (
      !row ||
      row.expiresAt < new Date() ||
      row.clientId !== input.clientId ||
      row.resource !== input.resource
    ) {
      throw new OAuthError(OAuthErrorCode.InvalidGrant, "Invalid or expired refresh token");
    }
    const now = new Date();
    const writeGrantWasRevoked =
      parseScopes(row.scopes).includes("mcp:write") && selected.userRole !== "admin";
    if (row.revokedAt || writeGrantWasRevoked) {
      tx.update(oauthTokens)
        .set({ revokedAt: now })
        .where(eq(oauthTokens.familyId, row.familyId))
        .run();
      return { rejected: true as const };
    }
    tx.update(oauthTokens)
      .set({ revokedAt: now })
      .where(and(eq(oauthTokens.tokenHash, row.tokenHash), isNull(oauthTokens.revokedAt)))
      .run();
    const grant = createTokenGrant({
      userId: row.userId,
      clientId: row.clientId,
      scopes: parseScopes(row.scopes),
      resource: row.resource,
      familyId: row.familyId,
    });
    tx.insert(oauthTokens).values([...grant.values]).run();
    return { rejected: false as const, response: grant.response };
  });
  if (result.rejected) {
    throw new OAuthError(OAuthErrorCode.InvalidGrant, "Refresh token has been revoked");
  }
  return result.response;
}

const tokenRequestSchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1),
    client_id: z.string().min(1),
    redirect_uri: z.string().min(1),
    code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
    resource: z.string().min(1),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1),
    client_id: z.string().min(1),
    resource: z.string().min(1),
  }),
]);

export async function exchangeTokenGrant(input: unknown) {
  const parsed = tokenRequestSchema.safeParse(input);
  if (!parsed.success) {
    const grantType =
      typeof input === "object" && input && "grant_type" in input
        ? String(input.grant_type)
        : "";
    throw new OAuthError(
      grantType && !["authorization_code", "refresh_token"].includes(grantType)
        ? OAuthErrorCode.UnsupportedGrantType
        : OAuthErrorCode.InvalidRequest,
      "Invalid token request",
    );
  }
  if (parsed.data.resource !== getMcpResourceUrl().toString()) {
    throw new OAuthError(OAuthErrorCode.InvalidTarget, "Invalid OAuth resource");
  }
  if (parsed.data.grant_type === "authorization_code") {
    return exchangeAuthorizationCode({
      code: parsed.data.code,
      clientId: parsed.data.client_id,
      redirectUri: parsed.data.redirect_uri,
      codeVerifier: parsed.data.code_verifier,
      resource: parsed.data.resource,
    });
  }
  return exchangeRefreshToken({
    refreshToken: parsed.data.refresh_token,
    clientId: parsed.data.client_id,
    resource: parsed.data.resource,
  });
}

export const oauthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = await db
      .select({ token: oauthTokens, userRole: users.role })
      .from(oauthTokens)
      .innerJoin(users, eq(oauthTokens.userId, users.id))
      .where(
        and(eq(oauthTokens.tokenHash, hash(token)), eq(oauthTokens.tokenType, "access")),
      )
      .get();
    const scopes = row ? parseScopes(row.token.scopes) : [];
    if (
      !row ||
      row.token.expiresAt < new Date() ||
      row.token.revokedAt ||
      row.token.resource !== getMcpResourceUrl().toString() ||
      (scopes.includes("mcp:write") && row.userRole !== "admin")
    ) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid or expired access token");
    }
    return {
      token,
      clientId: row.token.clientId,
      scopes,
      expiresAt: Math.floor(row.token.expiresAt.getTime() / 1000),
      resource: new URL(row.token.resource),
      extra: { userId: row.token.userId, role: row.userRole },
    };
  },
};
