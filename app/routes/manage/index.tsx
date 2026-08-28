import type { Route } from "./+types/index";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { stageOrphanedImagesBatch } from "~/lib/image-orphans.server";
import { getAdminDashboardCounts } from "~/lib/admin-dashboard.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const dashboard = await getAdminDashboardCounts();
  return dashboard;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "stage-orphaned-images") {
    return {
      error: "Unknown action.",
      orphanStageResult: null,
    };
  }

  const rawBatchSize = String(formData.get("batchSize") || "250");
  const parsedBatchSize = Number(rawBatchSize);
  const batchSize = Number.isFinite(parsedBatchSize)
    ? Math.min(Math.max(Math.floor(parsedBatchSize), 1), 5000)
    : 250;

  try {
    const result = await stageOrphanedImagesBatch({
      batchSize,
      dryRun: false,
      useCursor: true,
    });

    return {
      error: null,
      orphanStageResult: result,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to stage orphaned images.",
      orphanStageResult: null,
    };
  }
}

const contentTypes = [
  { key: "events", label: "Events", href: "/manage/events" },
  { key: "companies", label: "Companies", href: "/manage/companies" },
  { key: "groups", label: "Groups", href: "/manage/groups" },
  { key: "education", label: "Education", href: "/manage/education" },
  { key: "people", label: "People", href: "/manage/people" },
  { key: "news", label: "News", href: "/manage/news" },
  { key: "jobs", label: "Jobs", href: "/manage/jobs" },
  { key: "projects", label: "Projects", href: "/manage/projects" },
  { key: "products", label: "Products", href: "/manage/products" },
  { key: "technologies", label: "Technologies", href: "/manage/technologies" },
  { key: "comments", label: "Comments", href: "/manage/comments" },
] as const;

function ToolLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="border border-harbour-200 bg-white px-3 py-1.5 text-sm font-medium text-harbour-700 transition-colors hover:border-harbour-400 hover:bg-harbour-50"
    >
      {children}
    </Link>
  );
}

function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-harbour-100 px-3 py-3 last:border-b-0 sm:flex-row sm:items-center">
      <h3 className="w-32 shrink-0 text-sm font-medium text-harbour-500">{label}</h3>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export default function ManageIndex() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { counts, pending } = useLoaderData<typeof loader>();
  const isStagingOrphans =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "stage-orphaned-images";

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-harbour-700">Dashboard</h1>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm text-harbour-400 hover:text-harbour-600">
              View Site
            </Link>
            <Link
              to="/manage/settings"
              className="text-sm text-harbour-400 hover:text-harbour-600"
            >
              Settings
            </Link>
            <Link
              to="/manage/logout"
              className="text-sm text-harbour-400 hover:text-harbour-600"
            >
              Logout
            </Link>
          </div>
        </div>

        <Link
          to="/manage/review"
          className={`flex flex-wrap items-center justify-between gap-4 border p-4 transition-colors ${
            pending.total === 0
              ? "border-green-200 bg-green-50 hover:border-green-300"
              : "border-amber-200 bg-amber-50 hover:border-amber-300"
          }`}
        >
          <div>
            <h2 className="font-semibold text-harbour-700">Review queue</h2>
            <p className="text-sm text-harbour-500">
              {pending.total === 0
                ? "Everything has been reviewed."
                : "Review pending events, news, and jobs in one place."}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`${pending.total === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"} px-1.5 py-0.5`}
            >
              {pending.events} events
            </span>
            <span
              className={`${pending.total === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"} px-1.5 py-0.5`}
            >
              {pending.news} news
            </span>
            <span
              className={`${pending.total === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"} px-1.5 py-0.5`}
            >
              {pending.jobs} jobs
            </span>
            <span
              className={`${pending.total === 0 ? "bg-green-600" : "bg-amber-600"} px-1.5 py-0.5 font-medium text-white`}
            >
              {pending.total} total
            </span>
          </div>
        </Link>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-harbour-700">Tools</h2>
          <div className="border border-harbour-200 bg-white">
            <ToolGroup label="Directories">
              <ToolLink to="/manage/import/technl">TechNL</ToolLink>
              <ToolLink to="/manage/import/genesis">Genesis</ToolLink>
              <ToolLink to="/manage/import/bounce">Bounce</ToolLink>
            </ToolGroup>
            <ToolGroup label="GitHub">
              <ToolLink to="/manage/import/github-by-location">By Location</ToolLink>
              <ToolLink to="/manage/import/github-following">Connections</ToolLink>
            </ToolGroup>
            <ToolGroup label="Jobs">
              <ToolLink to="/manage/import/jobs">Import Sources</ToolLink>
              <ToolLink to="/manage/import/jobs/search">Board Search</ToolLink>
              <ToolLink to="/manage/import/jobs/importers">Importer Docs</ToolLink>
            </ToolGroup>
            <ToolGroup label="Events & News">
              <ToolLink to="/manage/import/events">Event Sources</ToolLink>
              <ToolLink to="/manage/import/news">News Sources</ToolLink>
            </ToolGroup>
            <ToolGroup label="Discord">
              <ToolLink to="/manage/discord/events">Post Events</ToolLink>
              <ToolLink to="/manage/discord/jobs">Post Jobs</ToolLink>
            </ToolGroup>
            <ToolGroup label="Data">
              <ToolLink to="/manage/export">Export Data</ToolLink>
            </ToolGroup>
            <ToolGroup label="Maintenance">
              <Form method="post" className="flex flex-1 flex-wrap items-end gap-2">
                <input type="hidden" name="intent" value="stage-orphaned-images" />
                <label className="flex items-center gap-2 text-xs text-harbour-500">
                  Stage orphaned images
                  <input
                    type="number"
                    name="batchSize"
                    defaultValue={250}
                    min={1}
                    max={5000}
                    aria-label="Orphan image batch size"
                    className="w-20 border border-harbour-200 px-2 py-1.5 text-sm text-harbour-700"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isStagingOrphans}
                  className="border border-harbour-600 bg-harbour-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-harbour-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isStagingOrphans ? "Staging…" : "Run"}
                </button>
              </Form>
              {actionData?.error ? (
                <p className="w-full border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-700">
                  {actionData.error}
                </p>
              ) : null}
              {actionData?.orphanStageResult ? (
                <p className="w-full border border-green-200 bg-green-50 px-2 py-1 text-sm text-green-700">
                  Scanned {actionData.orphanStageResult.scannedCount}; staged{" "}
                  {actionData.orphanStageResult.newlyStagedCount} new orphans.
                </p>
              ) : null}
            </ToolGroup>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-harbour-700">Content</h2>
          <div className="grid grid-cols-2 border-l border-t border-harbour-200 md:grid-cols-3">
            {contentTypes.map((type) => (
              <Link
                key={type.key}
                to={type.href}
                className="flex items-center justify-between gap-2 border-b border-r border-harbour-200 bg-white px-3 py-2 text-sm transition-colors hover:bg-harbour-50"
              >
                <span className="font-medium text-harbour-700">{type.label}</span>
                <span className="text-xs text-harbour-400">{counts[type.key]}</span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
