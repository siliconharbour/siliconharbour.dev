import type { Route } from "./+types/theme-shares.$id";
import { readThemeShareRequest } from "~/lib/theme-share-request.server";
import { getThemeShare, saveThemeShare } from "~/lib/theme-shares.server";
import { requestIp } from "~/lib/request-ip.server";

export function loader({ params }: Route.LoaderArgs) {
  return Response.json(getThemeShare(params.id), { headers: { "Cache-Control": "no-store" } });
}
export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "PUT") throw new Response("Method not allowed", { status: 405 });
  const ip = requestIp(context);
  return Response.json(
    await saveThemeShare(await readThemeShareRequest(request, ip), ip, {
      id: params.id,
      key: request.headers.get("X-Theme-Edit-Key"),
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
