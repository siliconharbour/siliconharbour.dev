import type { Route } from "./+types/genesis";
import { useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { scrapeGenesis } from "~/lib/scraper.server";
import {
  buildDirectoryImportLoaderData,
  handleDirectoryImportAction,
  type DirectoryImportConfig,
} from "~/lib/directory-import.server";
import {
  DirectoryImportPage,
  type StatusCategoriesConfig,
} from "~/components/manage/DirectoryImportPage";
import type { ScrapedCompany } from "~/lib/scraper.server";

const config: DirectoryImportConfig = {
  sourceKey: "genesis",
  sourceFlag: "genesis",
  sourceLabel: "Genesis Centre",
  defaultLocation: "St. John's, NL",
  scrapeFn: scrapeGenesis,
};

const statusCategories: StatusCategoriesConfig = {
  getValue: (company: ScrapedCompany) =>
    company.categories.find(
      (c) => c === "Current Company" || c === "Alumni Company",
    ) || "",
  options: [
    { value: "current", label: "Current Company" },
    { value: "alumni", label: "Alumni Company" },
  ],
};

function filterGenesisCategories(categories: string[]): string[] {
  return categories.filter(
    (c) => c !== "Current Company" && c !== "Alumni Company",
  );
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from Genesis Centre - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return buildDirectoryImportLoaderData(config);
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  return handleDirectoryImportAction(request, config);
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
