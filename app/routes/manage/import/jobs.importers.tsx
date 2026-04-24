import type { Route } from "./+types/jobs.importers";
import { Link, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getAllImporterMeta } from "~/lib/job-importers/index";
import type { ImporterReliability } from "~/lib/job-importers/types";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Job Importers Overview - siliconharbour.dev" },
    { name: "description", content: "Overview of all job importers and their reliability" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const importers = getAllImporterMeta();
  return { importers };
}

const reliabilityColors: Record<ImporterReliability, string> = {
  high: "bg-green-100 text-green-700",
  "medium-high": "bg-green-50 text-green-600",
  medium: "bg-amber-100 text-amber-700",
  "medium-low": "bg-amber-50 text-amber-600",
  low: "bg-red-100 text-red-700",
  mixed: "bg-harbour-100 text-harbour-600",
};

const reliabilityLabels: Record<ImporterReliability, string> = {
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
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        <div>
          <Link
            to="/manage/import/jobs"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Job Import Sources
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-harbour-700">Job Importers Overview</h1>
          <p className="text-harbour-500 mt-1">
            How each importer works, its implementation style, and reliability rating.
            This page is generated from importer metadata colocated with the code.
          </p>
        </div>

        <div className="border border-harbour-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-harbour-50 text-left">
                <th className="px-4 py-2 font-medium text-harbour-600">Importer</th>
                <th className="px-4 py-2 font-medium text-harbour-600">Approach</th>
                <th className="px-4 py-2 font-medium text-harbour-600">Style</th>
                <th className="px-4 py-2 font-medium text-harbour-600">Reliability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-harbour-100">
              {importers.map((imp) => (
                <tr key={imp.sourceType}>
                  <td className="px-4 py-3 font-medium text-harbour-700 whitespace-nowrap">
                    {imp.name}
                    <div className="font-mono text-xs text-harbour-400">{imp.sourceType}</div>
                  </td>
                  <td className="px-4 py-3 text-harbour-600">{imp.approach}</td>
                  <td className="px-4 py-3 text-harbour-500 whitespace-nowrap">{imp.style}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-1.5 py-0.5 ${reliabilityColors[imp.reliability as ImporterReliability] || "bg-harbour-100 text-harbour-600"}`}
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
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-harbour-700">Notes and Quirks</h2>
            <div className="flex flex-col gap-3">
              {importers
                .filter((imp) => imp.quirks)
                .map((imp) => (
                  <div key={imp.sourceType} className="p-3 border border-harbour-200">
                    <span className="font-medium text-harbour-700">{imp.name}</span>
                    <span className="mx-2 text-harbour-300">{"\u2014"}</span>
                    <span className="text-harbour-500">{imp.quirks}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="p-4 bg-harbour-50 border border-harbour-200 text-sm text-harbour-500">
          <p className="font-medium text-harbour-600 mb-1">How this page works</p>
          <p>
            Each importer exports a <code className="text-harbour-700">meta</code> property
            describing itself. This page reads that metadata from the importer registry, so it
            stays in sync automatically when importers are added or updated.
          </p>
        </div>
      </div>
    </div>
  );
}
