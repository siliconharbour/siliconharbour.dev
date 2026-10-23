import { operationCatalog } from "~/operations/catalog";
import { loadAdminOperation } from "~/lib/admin/run-operation.server";
import { runDirectoryImportAction } from "~/lib/admin/directory-import-action.server";
import type { Route } from "./+types/genesis";
import { useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import {
  DirectoryImportPage,
  type StatusCategoriesConfig,
} from "~/components/manage/DirectoryImportPage";
import type { ScrapedCompany } from "~/lib/scraper.server";

const statusCategories: StatusCategoriesConfig = {
  getValue: (company: ScrapedCompany) =>
    company.categories.find((c) => c === "Current Company" || c === "Alumni Company") || "",
  options: [
    { value: "current", label: "Current Company" },
    { value: "alumni", label: "Alumni Company" },
  ],
};

function filterGenesisCategories(categories: string[]): string[] {
  return categories.filter((c) => c !== "Current Company" && c !== "Alumni Company");
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from Genesis Centre - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return loadAdminOperation(request, operationCatalog.directoryImportReviewGet, {
    source: "genesis",
  });
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  return runDirectoryImportAction(request, "genesis");
}

export default function ImportGenesis() {
  return (
    <DirectoryImportPage
      sourceKey="genesis"
      sourceLabel="Genesis Centre"
      description="Import company data from the Genesis Centre startup portfolio. Companies will be flagged as Genesis Centre members with a dedicated link to the portfolio."
      loaderData={useLoaderData<typeof loader>()}
      statusCategories={statusCategories}
      showDescriptionInCard
      maxCategoryBadges={2}
      categoryFilter={filterGenesisCategories}
    />
  );
}
