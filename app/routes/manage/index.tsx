import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getAdminDashboardCounts } from "~/lib/admin-dashboard.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const dashboard = await getAdminDashboardCounts();
  return dashboard;
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
      className="border border-line bg-surface px-pad-3 py-pad-1-5 text-sm font-medium text-heading transition-colors hover:border-harbour-400 hover:bg-soft"
    >
      {children}
    </Link>
  );
}

function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-gap-2 border-b border-harbour-100 px-pad-3 py-pad-3 last:border-b-0 sm:flex-row sm:items-center">
      <h3 className="w-32 shrink-0 text-sm font-medium text-muted">{label}</h3>
      <div className="flex flex-1 flex-wrap items-center gap-gap-2">{children}</div>
    </div>
  );
}

export default function ManageIndex() {
  const { counts, pending, importFailures } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-gap-8">
        <div className="flex flex-wrap items-center justify-between gap-gap-3">
          <h1 className="text-2xl font-semibold text-heading">Dashboard</h1>
          <div className="flex items-center gap-gap-4">
            <Link to="/" className="text-sm text-subtle hover:text-body">
              View Site
            </Link>
            <Link to="/manage/settings" className="text-sm text-subtle hover:text-body">
              Settings
            </Link>
            <Link to="/manage/logout" className="text-sm text-subtle hover:text-body">
              Logout
            </Link>
          </div>
        </div>

        {importFailures.length > 0 && (
          <section
            className="border border-red-200 bg-red-50 p-pad-4"
            aria-labelledby="import-failures"
          >
            <div className="flex flex-wrap items-start justify-between gap-gap-2">
              <div>
                <h2 id="import-failures" className="font-semibold text-red-700">
                  Import failures
                </h2>
                <p className="text-sm text-red-600">
                  {importFailures.length} source{importFailures.length === 1 ? " is" : "s are"}{" "}
                  failing and may leave published content stale.
                </p>
              </div>
              <span className="bg-red-600 px-pad-1-5 py-pad-0-5 text-xs font-medium text-white">
                {importFailures.length} failing
              </span>
            </div>
            <div className="mt-3 divide-y divide-red-200 border border-red-200 bg-surface rounded-panel">
              {importFailures.map((failure) => (
                <Link
                  key={`${failure.kind}-${failure.id}`}
                  to={failure.href}
                  className="block px-pad-3 py-pad-2 transition-colors hover:bg-red-50"
                >
                  <div className="flex flex-wrap items-center gap-gap-2">
                    <span className="font-medium text-red-700">{failure.name}</span>
                    <span className="bg-red-100 px-pad-1-5 py-pad-0-5 text-xs text-red-700">
                      {failure.kind}
                    </span>
                    <span className="text-xs text-subtle">
                      {failure.lastAttemptAt
                        ? `last attempted ${new Date(failure.lastAttemptAt).toLocaleString(
                            "en-CA",
                            {
                              dateStyle: "medium",
                              timeStyle: "short",
                            },
                          )}`
                        : "never completed a sync"}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm text-red-600">
                    {failure.error ?? "Unknown import error"}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <Link
          to="/manage/review"
          className={`flex flex-wrap items-center justify-between gap-gap-4 border p-pad-4 transition-colors ${
            pending.total === 0
              ? "border-green-200 bg-green-50 hover:border-green-300"
              : "border-amber-200 bg-amber-50 hover:border-amber-300"
          }`}
        >
          <div>
            <h2 className="font-semibold text-heading">Review queue</h2>
            <p className="text-sm text-muted">
              {pending.total === 0
                ? "Everything has been reviewed."
                : "Review pending events, news, and jobs in one place."}
            </p>
          </div>
          <div className="flex items-center gap-gap-2 text-xs">
            <span
              className={`${pending.total === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"} px-pad-1-5 py-pad-0-5`}
            >
              {pending.events} events
            </span>
            <span
              className={`${pending.total === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"} px-pad-1-5 py-pad-0-5`}
            >
              {pending.news} news
            </span>
            <span
              className={`${pending.total === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"} px-pad-1-5 py-pad-0-5`}
            >
              {pending.jobs} jobs
            </span>
            <span
              className={`${pending.total === 0 ? "bg-green-600" : "bg-amber-600"} px-pad-1-5 py-pad-0-5 font-medium text-white`}
            >
              {pending.total} total
            </span>
          </div>
        </Link>

        <div className="flex flex-col gap-gap-3">
          <h2 className="text-lg font-semibold text-heading">Tools</h2>
          <div className="border border-line bg-surface rounded-panel">
            <ToolGroup label="Design">
              <ToolLink to="/manage/theme-shares">Theme shares</ToolLink>
              <ToolLink to="/manage/rejected-records">Rejected records</ToolLink>
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
            <ToolGroup label="Directories">
              <ToolLink to="/manage/import/technl">TechNL</ToolLink>
              <ToolLink to="/manage/import/genesis">Genesis</ToolLink>
              <ToolLink to="/manage/import/bounce">Bounce</ToolLink>
            </ToolGroup>
            <ToolGroup label="GitHub">
              <ToolLink to="/manage/import/github-by-location">By Location</ToolLink>
              <ToolLink to="/manage/import/github-following">Connections</ToolLink>
            </ToolGroup>
            <ToolGroup label="Data">
              <ToolLink to="/manage/export">Export Data</ToolLink>
              <ToolLink to="/manage/newsletter">Newsletter</ToolLink>
            </ToolGroup>
            <ToolGroup label="Maintenance">
              <ToolLink to="/manage/tools/orphaned-images">Orphaned Images</ToolLink>
            </ToolGroup>
          </div>
        </div>

        <div className="flex flex-col gap-gap-3">
          <h2 className="text-lg font-semibold text-heading">Content</h2>
          <div className="grid grid-cols-2 border-l border-t border-line md:grid-cols-3">
            {contentTypes.map((type) => (
              <Link
                key={type.key}
                to={type.href}
                className="flex items-center justify-between gap-gap-2 border-b border-r border-line bg-surface px-pad-3 py-pad-2 text-sm transition-colors hover:bg-soft"
              >
                <span className="font-medium text-heading">{type.label}</span>
                <span className="text-xs text-subtle">{counts[type.key]}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
