import type { Route } from "./+types/theme-shares";
import { readThemeShareRequest } from "~/lib/theme-share-request.server";
import { saveThemeShare } from "~/lib/theme-shares.server";
import { requestIp } from "~/lib/request-ip.server";

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") throw new Response("Method not allowed", { status: 405 });
  const ip = requestIp(context);
  const result = await saveThemeShare(await readThemeShareRequest(request, ip), ip);
  return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
}
