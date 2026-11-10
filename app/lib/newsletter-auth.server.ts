import { z } from "zod";
import { InvalidOperationError } from "~/operations/errors";

type AuthConfig = { issuer: string; clientId: string; clientSecret: string; scope: string };
const discoverySchema = z.object({
  issuer: z.string(),
  token_endpoint: z.url(),
  grant_types_supported: z.array(z.string()),
  token_endpoint_auth_methods_supported: z.array(z.string()),
});
const tokenSchema = z.object({
  access_token: z.string().min(1).max(32768),
  token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
  expires_in: z.number().positive().finite(),
  scope: z.string().optional(),
  refresh_token: z.never().optional(),
});
const authorizationError = () => new InvalidOperationError("Newsletter authorization failed");
const formValue = (value: string) => new URLSearchParams({ v: value }).toString().slice(2);

export function createNewsletterAuth(
  config: AuthConfig,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  let issuer: URL;
  try {
    issuer = new URL(config.issuer);
  } catch {
    throw authorizationError();
  }
  if (
    issuer.protocol !== "https:" ||
    issuer.username ||
    issuer.password ||
    issuer.hash ||
    issuer.search
  )
    throw authorizationError();
  const issuerUrl = issuer.href.replace(/\/$/, "");
  const scopes = new Set(config.scope.split(/\s+/).filter(Boolean));
  if (!config.clientId || !config.clientSecret || !scopes.size || scopes.has("offline_access"))
    throw authorizationError();
  let endpoint: string | undefined;
  let cached: { value: string; reuseUntil: number } | undefined;
  let pending: Promise<string> | undefined;

  async function request(url: string, init?: RequestInit): Promise<unknown> {
    try {
      const response = await fetcher(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw authorizationError();
      return await response.json();
    } catch {
      throw authorizationError();
    }
  }
  async function acquire() {
    if (!endpoint) {
      const parsed = discoverySchema.safeParse(
        await request(`${issuerUrl}/.well-known/openid-configuration`),
      );
      if (!parsed.success) throw authorizationError();
      const document = parsed.data;
      const target = new URL(document.token_endpoint);
      if (
        document.issuer.replace(/\/$/, "") !== issuerUrl ||
        target.origin !== issuer.origin ||
        target.username ||
        target.password ||
        target.hash ||
        !document.grant_types_supported.includes("client_credentials") ||
        !document.token_endpoint_auth_methods_supported.includes("client_secret_basic")
      )
        throw authorizationError();
      endpoint = target.href;
    }
    const started = now();
    const parsed = tokenSchema.safeParse(
      await request(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${formValue(config.clientId)}:${formValue(config.clientSecret)}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ grant_type: "client_credentials", scope: config.scope }),
      }),
    );
    if (!parsed.success) throw authorizationError();
    const token = parsed.data;
    const granted =
      token.scope === undefined ? scopes : new Set(token.scope.split(/\s+/).filter(Boolean));
    const lifetime = token.expires_in * 1000;
    const expires = started + lifetime;
    if (
      granted.size !== scopes.size ||
      [...scopes].some((scope) => !granted.has(scope)) ||
      !Number.isFinite(expires) ||
      expires <= now()
    )
      throw authorizationError();
    cached = {
      value: token.access_token,
      reuseUntil: expires - Math.min(60000, Math.max(30000, lifetime / 10)),
    };
    return token.access_token;
  }
  return {
    token(): Promise<string> {
      if (cached && now() < cached.reuseUntil) return Promise.resolve(cached.value);
      pending ??= acquire().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    invalidate(rejected: string) {
      if (cached?.value === rejected) cached = undefined;
    },
  };
}

function configuration(): AuthConfig {
  return {
    issuer: process.env.LISTS_AUTH_ISSUER ?? "",
    clientId: process.env.LISTS_AUTH_CLIENT_ID ?? "",
    clientSecret: process.env.LISTS_AUTH_CLIENT_SECRET ?? "",
    scope: process.env.LISTS_AUTH_SCOPE ?? "",
  };
}
export function isNewsletterAuthConfigured() {
  return Object.values(configuration()).every(Boolean);
}
let current: { config: AuthConfig; auth: ReturnType<typeof createNewsletterAuth> } | undefined;
export function newsletterAuth() {
  const config = configuration();
  if (!Object.values(config).every(Boolean))
    throw new InvalidOperationError("Newsletter authorization is not configured");
  if (
    !current ||
    current.config.issuer !== config.issuer ||
    current.config.clientId !== config.clientId ||
    current.config.clientSecret !== config.clientSecret ||
    current.config.scope !== config.scope
  )
    current = { config, auth: createNewsletterAuth(config) };
  return current.auth;
}
