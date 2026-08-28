import type { Route } from "./+types/oauth.register";
import { methodNotAllowed, oauthJson, readJsonBody } from "~/mcp/oauth-http.server";
import { registerClient } from "~/mcp/oauth.server";

export function loader() {
  return methodNotAllowed();
}

export async function action({ request }: Route.ActionArgs) {
  return oauthJson(async () => registerClient(await readJsonBody(request)), 201);
}
