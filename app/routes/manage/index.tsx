import type { Route } from "./+types/index";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getAllEvents } from "~/lib/events.server";
import { getAllCompanies } from "~/lib/companies.server";
import { getAllGroups } from "~/lib/groups.server";
import { getAllEducation } from "~/lib/education.server";
import { getAllPeople } from "~/lib/people.server";
import { getAllNews } from "~/lib/news.server";
import { getAllJobs } from "~/lib/jobs.server";
import { getAllProjects } from "~/lib/projects.server";
import { getAllProducts } from "~/lib/products.server";
import { getCommentCount } from "~/lib/comments.server";
import { getTechnologiesCount } from "~/lib/technologies.server";
import { stageOrphanedImagesBatch } from "~/lib/image-orphans.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { user } = await requireAuth(request);
  const [
    events,
    companies,
    groups,
    education,
    people,
    news,
    jobs,
    projects,
    products,
    commentsCount,
    technologiesCount,
  ] = await Promise.all([
    getAllEvents(),
    getAllCompanies(),
    getAllGroups(),
    getAllEducation(),
    getAllPeople(),
    getAllNews(),
    getAllJobs(),
    getAllProjects(),
    getAllProducts(),
    getCommentCount(),
    getTechnologiesCount(),
  ]);
  return {
    user,
    counts: {
      events: events.length,
      companies: companies.length,
      groups: groups.length,
      education: education.length,
      people: people.length,
      news: news.length,
      jobs: jobs.length,
      projects: projects.length,
      products: products.length,
      comments: commentsCount,
      technologies: technologiesCount,
    },
  };
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

export default function ManageIndex() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { user, counts } = useLoaderData<typeof loader>();
  const isStagingOrphans =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "stage-orphaned-images";

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-harbour-700">Dashboard</h1>
            <p className="text-harbour-400 text-sm">Welcome, {user.email}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/manage/settings" className="text-sm text-harbour-400 hover:text-harbour-600">
              Settings
            </Link>
            <Link to="/" className="text-sm text-harbour-400 hover:text-harbour-600">
              View Site
            </Link>
            <Link to="/manage/logout" className="text-sm text-harbour-400 hover:text-harbour-600">
              Logout
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contentTypes.map((type) => (
            <Link
              key={type.key}
              to={type.href}
              className="p-6 bg-white border border-harbour-200 hover:border-harbour-400 transition-colors flex flex-col gap-2"
            >
              <h2 className="text-lg font-semibold text-harbour-700">{type.label}</h2>
              <p className="text-harbour-400 text-sm">
                {counts[type.key]} {type.label.toLowerCase()}
              </p>
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Import Tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              to="/manage/import/technl"
              className="p-4 bg-white border border-harbour-200 hover:border-harbour-400 transition-colors flex flex-col gap-1"
            >
              <h3 className="font-medium text-harbour-700">TechNL Directory</h3>
              <p className="text-harbour-400 text-sm">
                Import companies from the TechNL member directory
              </p>
            </Link>
            <Link
              to="/manage/import/genesis"
              className="p-4 bg-white border border-harbour-200 hover:border-harbour-400 transition-colors flex flex-col gap-1"
            >
              <h3 className="font-medium text-harbour-700">Genesis Centre</h3>
              <p className="text-harbour-400 text-sm">
                Import companies from the Genesis Centre portfolio
              </p>
            </Link>
            <Link
              to="/manage/import/github-by-location"
              className="p-4 bg-white border border-harbour-200 hover:border-harbour-400 transition-colors flex flex-col gap-1"
            >
              <h3 className="font-medium text-harbour-700">GitHub by Location</h3>
              <p className="text-harbour-400 text-sm">
                Search GitHub for users with Newfoundland in their location field
              </p>
            </Link>
            <Link
              to="/manage/import/github-following"
              className="p-4 bg-white border border-harbour-200 hover:border-harbour-400 transition-colors flex flex-col gap-1"
            >
              <h3 className="font-medium text-harbour-700">GitHub Connections</h3>
              <p className="text-harbour-400 text-sm">
                Import from a user's following/followers - useful for finding local devs who don't
                list their location
              </p>
            </Link>
            <Link
              to="/manage/import/jobs"
              className="p-4 bg-white border border-harbour-200 hover:border-harbour-400 transition-colors flex flex-col gap-1"
            >
              <h3 className="font-medium text-harbour-700">Job Import</h3>
              <p className="text-harbour-400 text-sm">
                Import jobs from company career pages
              </p>
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Export Tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              to="/manage/export"
              className="p-4 bg-white border border-harbour-200 hover:border-harbour-400 transition-colors flex flex-col gap-1"
            >
              <h3 className="font-medium text-harbour-700">Export Data</h3>
              <p className="text-harbour-400 text-sm">
                Download all content as markdown files in a ZIP archive
              </p>
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Maintenance Tools</h2>
          <div className="p-4 bg-white border border-harbour-200 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="font-medium text-harbour-700">Stage Orphaned Images</h3>
              <p className="text-harbour-400 text-sm">
                Scan image files in batches and stage unreferenced files for manual removal.
              </p>
            </div>

            <Form method="post" className="flex flex-col sm:flex-row sm:items-end gap-3">
              <input type="hidden" name="intent" value="stage-orphaned-images" />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-harbour-500">Batch size</span>
                <input
                  type="number"
                  name="batchSize"
                  defaultValue={250}
                  min={1}
                  max={5000}
                  className="border border-harbour-200 px-2 py-1 text-sm"
                />
              </label>
              <button
                type="submit"
                disabled={isStagingOrphans}
                className="px-3 py-1.5 text-sm bg-harbour-600 text-white border border-harbour-600 hover:bg-harbour-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isStagingOrphans ? "Staging..." : "Stage Orphaned Batch"}
              </button>
            </Form>

            {actionData?.error ? (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-2 py-1">
                {actionData.error}
              </p>
            ) : null}

            {actionData?.orphanStageResult ? (
              <div className="text-sm text-harbour-600 border border-harbour-200 px-3 py-2 bg-harbour-50 flex flex-col gap-1">
                <p>
                  Scanned {actionData.orphanStageResult.scannedCount} images. Staged{" "}
                  {actionData.orphanStageResult.newlyStagedCount} new orphans.
                </p>
                <p>
                  Next offset: {actionData.orphanStageResult.nextOffset} /{" "}
                  {actionData.orphanStageResult.totalImages}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
