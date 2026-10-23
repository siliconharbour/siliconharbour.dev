import { operationCatalog } from "~/operations/catalog";
import { loadAdminOperation } from "~/lib/admin/run-operation.server";
import { runDirectoryImportAction } from "~/lib/admin/directory-import-action.server";
import type { Route } from "./+types/bounce";
import { useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { DirectoryImportPage } from "~/components/manage/DirectoryImportPage";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from Bounce Health Innovation - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return loadAdminOperation(request, operationCatalog.directoryImportReviewGet, {
    source: "bounce",
  });
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  return runDirectoryImportAction(request, "bounce");
}

export default function ImportBounce() {
  return (
    <DirectoryImportPage
      sourceKey="bounce"
      sourceLabel="Bounce Health Innovation"
      description="Import company data from Bounce Health Innovation's NL healthtech partner directory. Companies will be flagged as Bounce partners."
      loaderData={useLoaderData<typeof loader>()}
      showDescriptionInCard
      maxCategoryBadges={2}
    />
  );
}
