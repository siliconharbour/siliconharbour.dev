import type { Route } from "./+types/export";
import { Link } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { useState } from "react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Export - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return {};
}

export default function Export() {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const response = await fetch("/export.zip");
      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || "siliconharbour-export.zip";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-gap-1">
            <h1 className="text-2xl font-semibold text-heading">Export</h1>
            <p className="text-subtle text-sm">Export and backup your site data</p>
          </div>
          <Link to="/manage" className="text-sm text-subtle hover:text-body">
            Back to Dashboard
          </Link>
        </div>

        <div className="bg-surface border border-line p-pad-6 rounded-panel">
          <h2 className="text-lg font-semibold text-heading mb-4">Export All Data</h2>
          <p className="text-sm text-subtle mb-6">
            Download all site content as a ZIP archive containing markdown files with YAML
            frontmatter. This includes events, companies, groups, education, people, news, jobs, and
            projects.
          </p>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-pad-6 py-pad-2 bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? "Exporting..." : "Download ZIP"}
          </button>
        </div>
      </div>
    </div>
  );
}
