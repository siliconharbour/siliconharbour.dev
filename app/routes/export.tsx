import type { Route } from "./+types/export";
import { redirect } from "react-router";
import { runAdminOperation } from "~/lib/admin/run-operation.server";
import { operationCatalog } from "~/operations/catalog";
import { consumeExportToken, buildSiteExport } from "~/lib/site-export.server";
export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token");
  if (token) {
    if (!consumeExportToken(token)) throw new Response("Download link expired", { status: 410 });
    return buildSiteExport();
  }
  const result = await runAdminOperation(request, operationCatalog.siteExport, {});
  if (!result.ok) throw new Response(result.error, { status: 400 });
  return redirect(result.data.url);
}
