import { operationCatalog } from "~/operations/catalog";
import { loadAdminOperation } from "~/lib/admin/run-operation.server";
import { runDirectoryImportAction } from "~/lib/admin/directory-import-action.server";
import type { Route } from "./+types/technl";
import { useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { DirectoryImportPage } from "~/components/manage/DirectoryImportPage";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from TechNL - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return loadAdminOperation(request, operationCatalog.directoryImportReviewGet, {
    source: "technl",
  });
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  return runDirectoryImportAction(request, "technl");
}

export default function ImportTechNL() {
  return (
    <DirectoryImportPage
      sourceKey="technl"
      sourceLabel="TechNL"
      description="Import company data from the TechNL member directory. Companies will be flagged as TechNL members with a dedicated link to their directory listing."
      loaderData={useLoaderData<typeof loader>()}
    />
  );
}
