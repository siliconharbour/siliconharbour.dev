import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import { hashIP } from "~/lib/comments.server";
import { checkRateLimit, cleanupExpiredRateLimits } from "~/lib/ratelimit.server";

const MAX_OAUTH_BODY_BYTES = 32 * 1024;
const REGISTRATION_LIMIT = 20;
const GLOBAL_REGISTRATION_LIMIT = 500;
const REGISTRATION_WINDOW_SECONDS = 10 * 60;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const;

export function methodNotAllowed() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function oauthJson(
  operation: () => Promise<unknown>,
  successStatus = 200,
): Promise<Response> {
  try {
    return Response.json(await operation(), {
      status: successStatus,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    if (OAuthError.isInstance(error)) {
      return Response.json(
        { error: error.code, error_description: error.message },
        {
          status:
            error.code === OAuthErrorCode.ServerError
              ? 500
              : error.code === OAuthErrorCode.TemporarilyUnavailable
                ? 503
                : error.code === OAuthErrorCode.TooManyRequests
                  ? 429
              : error.code === OAuthErrorCode.InvalidClient
                ? 401
                : 400,
          headers: NO_STORE_HEADERS,
        },
      );
    }
    console.error("OAuth endpoint error:", error);
    return Response.json(
      { error: OAuthErrorCode.ServerError, error_description: "OAuth request failed" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await readLimitedBody(request));
  } catch {
    throw new OAuthError(OAuthErrorCode.InvalidRequest, "Request body must be valid JSON");
  }
}

export async function readFormBody(request: Request): Promise<Record<string, string>> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    throw new OAuthError(
      OAuthErrorCode.InvalidRequest,
      "Request body must use application/x-www-form-urlencoded",
    );
  }
  const params = new URLSearchParams(await readLimitedBody(request));
  return Object.fromEntries(params);
}

async function readLimitedBody(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_OAUTH_BODY_BYTES) {
    throw new OAuthError(OAuthErrorCode.InvalidRequest, "OAuth request body is too large");
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_OAUTH_BODY_BYTES) {
      await reader.cancel();
      throw new OAuthError(OAuthErrorCode.InvalidRequest, "OAuth request body is too large");
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export async function enforceRegistrationRateLimit(request: Request): Promise<Response | null> {
  const clientIp =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    request.headers.get("X-Real-IP") ||
    "unknown";
  const keys = [`oauth-register:${hashIP(clientIp)}`, "oauth-register:global"];
  const limits = [REGISTRATION_LIMIT, GLOBAL_REGISTRATION_LIMIT];
  for (let index = 0; index < keys.length; index += 1) {
    const result = await checkRateLimit(keys[index], limits[index], REGISTRATION_WINDOW_SECONDS);
    if (!result.allowed) {
      return Response.json(
        { error: "temporarily_unavailable", error_description: "Too many client registrations" },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000))),
          },
        },
      );
    }
  }
  await cleanupExpiredRateLimits();
  return null;
}
