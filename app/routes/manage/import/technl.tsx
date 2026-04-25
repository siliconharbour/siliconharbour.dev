import type { Route } from "./+types/technl";
import { useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { scrapeTechNL } from "~/lib/scraper.server";
import {
  buildDirectoryImportLoaderData,
  handleDirectoryImportAction,
  type DirectoryImportConfig,
} from "~/lib/directory-import.server";
import { DirectoryImportPage } from "~/components/manage/DirectoryImportPage";

const config: DirectoryImportConfig = {
  sourceKey: "technl",
  sourceFlag: "technl",
  sourceLabel: "TechNL",
  defaultLocation: null,
  scrapeFn: scrapeTechNL,
  includesEducation: true,
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from TechNL - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return buildDirectoryImportLoaderData(config);
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  return handleDirectoryImportAction(request, config);
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
