import type { Route } from "./+types/oauth.authorize";
import { data, Form, redirect, useLoaderData } from "react-router";
import { commitSession, getSession, requireAuth } from "~/lib/session.server";
import { readFormBody } from "~/mcp/oauth-http.server";
import {
  consumeConsentRequest,
  createConsentRequest,
  createAuthorizationCode,
  validateAuthorizationRequest,
} from "~/mcp/oauth.server";

const AUTHORIZATION_FIELDS = [
  "client_id",
  "redirect_uri",
  "response_type",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
] as const;

const CONSENT_SESSION_KEY = "oauthConsent";

interface ConsentTransaction {
  nonce: string;
  params: Record<string, string>;
}

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
} as const;

export function meta({}: Route.MetaArgs) {
  return [{ title: "Authorize MCP access - siliconharbour.dev" }];
}

export function headers() {
  return SECURITY_HEADERS;
}

function loginPath(request: Request, params = new URL(request.url).searchParams) {
  const url = new URL(request.url);
  const returnTo = `${url.pathname}${params.size > 0 ? `?${params}` : ""}`;
  return `/manage/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { user } = await requireAuth(request, loginPath(request));
  const params = new URL(request.url).searchParams;
  const authorization = await validateAuthorizationRequest(params, user.role);

  const consentNonce = await createConsentRequest(
    user.id,
    Object.fromEntries(AUTHORIZATION_FIELDS.map((name) => [name, params.get(name) || ""])),
  );
  const session = await getSession(request);
  session.set(CONSENT_SESSION_KEY, {
    nonce: consentNonce,
    params: Object.fromEntries(AUTHORIZATION_FIELDS.map((name) => [name, params.get(name) || ""])),
  } satisfies ConsentTransaction);

  return data(
    {
      clientId: authorization.clientId,
      clientName: authorization.client.name,
      redirectHost: new URL(authorization.redirectUri).host,
      redirectUri: authorization.redirectUri,
      scopes: authorization.scopes,
      consentNonce,
    },
    { headers: { ...SECURITY_HEADERS, "Set-Cookie": await commitSession(session) } },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await readFormBody(request);
  const session = await getSession(request);
  const transaction = session.get(CONSENT_SESSION_KEY) as ConsentTransaction | undefined;
  if (!transaction || formData.consent_nonce !== transaction.nonce) {
    throw new Response("Invalid or expired consent request", {
      status: 400,
      headers: SECURITY_HEADERS,
    });
  }
  const recoveryParams = new URLSearchParams(transaction.params);
  const { user } = await requireAuth(request, loginPath(request, recoveryParams));
  const storedParams = await consumeConsentRequest(transaction.nonce, user.id);
  if (!storedParams) {
    throw new Response("Invalid or expired consent request", {
      status: 400,
      headers: SECURITY_HEADERS,
    });
  }
  const params = new URLSearchParams(storedParams);
  session.unset(CONSENT_SESSION_KEY);
  const authorization = await validateAuthorizationRequest(params, user.role);
  const destination = new URL(authorization.redirectUri);

  if (formData.decision !== "allow") {
    destination.searchParams.set("error", "access_denied");
  } else {
    destination.searchParams.set(
      "code",
      await createAuthorizationCode({
        userId: user.id,
        clientId: authorization.clientId,
        redirectUri: authorization.redirectUri,
        scopes: authorization.scopes,
        codeChallenge: authorization.codeChallenge,
        resource: authorization.resource,
      }),
    );
  }
  if (authorization.state) destination.searchParams.set("state", authorization.state);
  return redirect(destination.toString(), {
    headers: { ...SECURITY_HEADERS, "Set-Cookie": await commitSession(session) },
  });
}

export default function OAuthAuthorize() {
  const { clientId, clientName, consentNonce, redirectHost, redirectUri, scopes } =
    useLoaderData<typeof loader>();

  return (
    <main className="min-h-screen bg-soft px-pad-4 py-pad-16 text-heading">
      <section className="mx-auto max-w-lg border border-line bg-surface p-pad-6 rounded-panel">
        <h1 className="text-2xl font-semibold">Authorize MCP access</h1>
        <p className="mt-3 text-body">
          <strong>{clientName}</strong> wants to connect to siliconharbour.dev.
        </p>
        <div className="mt-4 border border-amber-300 bg-amber-50 p-pad-3 text-sm text-amber-900">
          Client names are self-reported. Only continue if you trust the application at{" "}
          <strong>{redirectHost}</strong>.
          <dl className="mt-2 break-all text-xs">
            <dt className="font-semibold">Redirect address</dt>
            <dd>{redirectUri}</dd>
            <dt className="mt-2 font-semibold">Client ID</dt>
            <dd>{clientId}</dd>
          </dl>
        </div>

        <div className="mt-6 divide-y divide-harbour-100 border-y border-harbour-100">
          {scopes.map((scope) => (
            <div key={scope} className="py-pad-3 text-sm">
              {scope === "mcp:write" ? "Review and change site data" : "Search and read site data"}
            </div>
          ))}
        </div>

        <Form method="post" className="mt-6 flex gap-gap-3">
          <input type="hidden" name="consent_nonce" value={consentNonce} />
          <button
            type="submit"
            name="decision"
            value="allow"
            className="border border-harbour-600 bg-primary px-pad-4 py-pad-2 font-medium text-white hover:bg-primary-hover"
          >
            Allow access
          </button>
          <button
            type="submit"
            name="decision"
            value="deny"
            className="border border-harbour-300 bg-surface px-pad-4 py-pad-2 font-medium text-heading hover:bg-soft"
          >
            Deny
          </button>
        </Form>
      </section>
    </main>
  );
}
