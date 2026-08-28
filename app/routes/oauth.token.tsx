import type { Route } from "./+types/oauth.token";
import { methodNotAllowed, oauthJson, readFormBody } from "~/mcp/oauth-http.server";
import { exchangeTokenGrant } from "~/mcp/oauth.server";

export function loader() {
  return methodNotAllowed();
}

export async function action({ request }: Route.ActionArgs) {
  return oauthJson(async () => exchangeTokenGrant(await readFormBody(request)));
}
