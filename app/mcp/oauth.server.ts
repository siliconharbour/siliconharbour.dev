import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { OAuthError, OAuthErrorCode, type AuthInfo } from "@modelcontextprotocol/server";
import { z } from "zod";
import { db } from "~/db";
import {
  oauthAuthorizationCodes,
  oauthClients,
  oauthTokens,
  users,
} from "~/db/schema";

export const MCP_SCOPES = ["mcp:read", "mcp:write"] as const;
const ACCESS_TOKEN_SECONDS = 60 * 60;
const REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 30;
const AUTHORIZATION_CODE_SECONDS = 5 * 60;

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
  redirect_uris: z.array(z.string().refine(isValidRedirectUri)).min(1),
});

export async function registerClient(input: unknown) {
  const parsed = clientRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    throw new OAuthError(OAuthErrorCode.InvalidClientMetadata, "Invalid client metadata");
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

function verifyPkce(verifier: string, challenge: string): boolean {
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

function createTokenGrant(input: {
  userId: number;
  clientId: string;
  scopes: string[];
  resource: string;
}) {
  const accessToken = opaqueValue();
  const refreshToken = opaqueValue();
  const now = Date.now();
  const values = [
    {
      tokenHash: hash(accessToken),
      tokenType: "access",
      userId: input.userId,
      clientId: input.clientId,
      scopes: serializeScopes(input.scopes),
      resource: input.resource,
      expiresAt: new Date(now + ACCESS_TOKEN_SECONDS * 1000),
    },
    {
      tokenHash: hash(refreshToken),
      tokenType: "refresh",
      userId: input.userId,
      clientId: input.clientId,
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
    const row = tx
      .select()
      .from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.codeHash, hash(input.code)))
      .get();
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
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(oauthTokens)
      .where(
        and(
          eq(oauthTokens.tokenHash, hash(input.refreshToken)),
          eq(oauthTokens.tokenType, "refresh"),
        ),
      )
      .get();
    if (
      !row ||
      row.expiresAt < new Date() ||
      row.clientId !== input.clientId ||
      row.resource !== input.resource
    ) {
      throw new OAuthError(OAuthErrorCode.InvalidGrant, "Invalid or expired refresh token");
    }
    tx.delete(oauthTokens).where(eq(oauthTokens.tokenHash, row.tokenHash)).run();
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
    if (!row || row.token.expiresAt < new Date()) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid or expired access token");
    }
    return {
      token,
      clientId: row.token.clientId,
      scopes: parseScopes(row.token.scopes),
      expiresAt: Math.floor(row.token.expiresAt.getTime() / 1000),
      resource: new URL(row.token.resource),
      extra: { userId: row.token.userId, role: row.userRole },
    };
  },
};
