import type { Route } from "./+types/oauth.register";
import {
  enforceRegistrationRateLimit,
  methodNotAllowed,
  oauthJson,
  readJsonBody,
} from "~/mcp/oauth-http.server";
import { registerClient } from "~/mcp/oauth.server";

export function loader() {
  return methodNotAllowed();
}

export async function action({ request }: Route.ActionArgs) {
  const limited = await enforceRegistrationRateLimit(request);
  if (limited) return limited;
  return oauthJson(async () => registerClient(await readJsonBody(request)), 201);
}
