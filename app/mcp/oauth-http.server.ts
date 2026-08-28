import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";

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
    return await request.json();
  } catch {
    throw new OAuthError(OAuthErrorCode.InvalidRequest, "Request body must be valid JSON");
  }
}
