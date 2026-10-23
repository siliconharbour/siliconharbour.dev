import { operationCatalog } from "~/operations/catalog";
import { loadAllAdminItems } from "~/lib/admin/run-operation.server";
import type { Route } from "./+types/jobs.importers";
import { Link, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import type { ImporterReliability } from "~/lib/job-importers/types";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Job Importers Overview - siliconharbour.dev" },
    { name: "description", content: "Overview of all job importers and their reliability" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const importers = await loadAllAdminItems(request, operationCatalog.importerTypeList);
  return { importers };
}

const reliabilityColors: Record<string, string> = {
  high: "bg-green-100 text-green-700",
  "medium-high": "bg-green-50 text-green-600",
  medium: "bg-amber-100 text-amber-700",
  "medium-low": "bg-amber-50 text-amber-600",
  low: "bg-red-100 text-red-700",
  mixed: "bg-tint text-body",
};

const reliabilityLabels: Record<string, string> = {
  high: "High",
  "medium-high": "Medium-High",
  medium: "Medium",
  "medium-low": "Medium-Low",
  low: "Low",
  mixed: "Mixed",
};

export default function ManageImportJobImportersPage() {
  const { importers } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-gap-8">
        <div>
          <Link to="/manage/import/jobs" className="text-sm text-subtle hover:text-body">
            &larr; Back to Job Import Sources
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-heading">Job Importers Overview</h1>
          <p className="text-muted mt-1">
            How each importer works, its implementation style, and reliability rating. This page is
            generated from importer metadata colocated with the code.
          </p>
        </div>

        <div className="border border-line overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-soft text-left">
                <th className="px-pad-4 py-pad-2 font-medium text-body">Importer</th>
                <th className="px-pad-4 py-pad-2 font-medium text-body">Approach</th>
                <th className="px-pad-4 py-pad-2 font-medium text-body">Style</th>
                <th className="px-pad-4 py-pad-2 font-medium text-body">Reliability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-harbour-100">
              {importers.map((imp) => (
                <tr key={imp.sourceType}>
                  <td className="px-pad-4 py-pad-3 font-medium text-heading whitespace-nowrap">
                    {imp.name}
                    <div className="font-mono text-xs text-subtle">{imp.sourceType}</div>
                  </td>
                  <td className="px-pad-4 py-pad-3 text-body">{imp.approach}</td>
                  <td className="px-pad-4 py-pad-3 text-muted whitespace-nowrap">{imp.style}</td>
                  <td className="px-pad-4 py-pad-3">
                    <span
                      className={`text-xs px-pad-1-5 py-pad-0-5 ${reliabilityColors[imp.reliability as ImporterReliability] || "bg-tint text-body"}`}
                    >
                      {reliabilityLabels[imp.reliability as ImporterReliability] || imp.reliability}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {importers.some((imp) => imp.quirks) && (
          <div className="flex flex-col gap-gap-4">
            <h2 className="text-lg font-semibold text-heading">Notes and Quirks</h2>
            <div className="flex flex-col gap-gap-3">
              {importers
                .filter((imp) => imp.quirks)
                .map((imp) => (
                  <div key={imp.sourceType} className="p-pad-3 border border-line">
                    <span className="font-medium text-heading">{imp.name}</span>
                    <span className="mx-2 text-harbour-300">{"\u2014"}</span>
                    <span className="text-muted">{imp.quirks}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="p-pad-4 bg-soft border border-line text-sm text-muted">
          <p className="font-medium text-body mb-1">How this page works</p>
          <p>
            Each importer exports a <code className="text-heading">meta</code> property describing
            itself. This page reads that metadata from the importer registry, so it stays in sync
            automatically when importers are added or updated.
          </p>
        </div>
      </div>
    </div>
  );
}
