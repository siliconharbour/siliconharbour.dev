import type { Route } from "./+types/oauth.authorize";
import { Form, redirect, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
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

export function meta({}: Route.MetaArgs) {
  return [{ title: "Authorize MCP access - siliconharbour.dev" }];
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

  return {
    clientName: authorization.client.name,
    scopes: authorization.scopes,
    fields: Object.fromEntries(AUTHORIZATION_FIELDS.map((name) => [name, params.get(name) || ""])),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const params = new URLSearchParams();
  for (const name of AUTHORIZATION_FIELDS) {
    const value = formData.get(name);
    if (typeof value === "string") params.set(name, value);
  }
  const { user } = await requireAuth(request, loginPath(request, params));
  const authorization = await validateAuthorizationRequest(params, user.role);
  const destination = new URL(authorization.redirectUri);

  if (formData.get("decision") !== "allow") {
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
  return redirect(destination.toString());
}

export default function OAuthAuthorize() {
  const { clientName, scopes, fields } = useLoaderData<typeof loader>();

  return (
    <main className="min-h-screen bg-harbour-50 px-4 py-16 text-harbour-700">
      <section className="mx-auto max-w-lg border border-harbour-200 bg-white p-6">
        <h1 className="text-2xl font-semibold">Authorize MCP access</h1>
        <p className="mt-3 text-harbour-600">
          <strong>{clientName}</strong> wants to connect to siliconharbour.dev.
        </p>

        <div className="mt-6 divide-y divide-harbour-100 border-y border-harbour-100">
          {scopes.map((scope) => (
            <div key={scope} className="py-3 text-sm">
              {scope === "mcp:write" ? "Review and change site data" : "Search and read site data"}
            </div>
          ))}
        </div>

        <Form method="post" className="mt-6 flex gap-3">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <button
            type="submit"
            name="decision"
            value="allow"
            className="border border-harbour-600 bg-harbour-600 px-4 py-2 font-medium text-white hover:bg-harbour-700"
          >
            Allow access
          </button>
          <button
            type="submit"
            name="decision"
            value="deny"
            className="border border-harbour-300 bg-white px-4 py-2 font-medium text-harbour-700 hover:bg-harbour-50"
          >
            Deny
          </button>
        </Form>
      </section>
    </main>
  );
}
