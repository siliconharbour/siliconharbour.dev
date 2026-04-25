import type { Route } from "./+types/bounce";
import { useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { scrapeBounce } from "~/lib/scraper.server";
import {
  buildDirectoryImportLoaderData,
  handleDirectoryImportAction,
  type DirectoryImportConfig,
} from "~/lib/directory-import.server";
import { DirectoryImportPage } from "~/components/manage/DirectoryImportPage";

const config: DirectoryImportConfig = {
  sourceKey: "bounce",
  sourceFlag: "bounce",
  sourceLabel: "Bounce Health Innovation",
  defaultLocation: "St. John's, NL",
  scrapeFn: scrapeBounce,
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from Bounce Health Innovation - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return buildDirectoryImportLoaderData(config);
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  return handleDirectoryImportAction(request, config);
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
