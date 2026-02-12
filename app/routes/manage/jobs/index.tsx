import type { Route } from "./+types/index";
import { Link, Form, useLoaderData, redirect } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { db } from "~/db";
import { jobs, companies } from "~/db/schema";
import { eq, desc, like, or } from "drizzle-orm";
import { SearchInput } from "~/components/SearchInput";
import { format } from "date-fns";
import { ManagePage } from "~/components/manage/ManagePage";
import { ManageList, ManageListActions, ManageListEmpty, ManageListItem } from "~/components/manage/ManageList";
import { deleteJob, getJobById } from "~/lib/jobs.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Jobs - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";

  // Build query with optional search
  let query = db
    .select({
      job: jobs,
      companyName: companies.name,
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .orderBy(desc(jobs.updatedAt))
    .$dynamic();

  if (searchQuery) {
    query = query.where(
      or(
        like(jobs.title, `%${searchQuery}%`),
        like(companies.name, `%${searchQuery}%`),
        like(jobs.location, `%${searchQuery}%`),
      ),
    );
  }

  const results = await query.limit(100);

  const jobsList = results.map((r) => ({
    ...r.job,
    companyName: r.companyName,
  }));

  return { jobs: jobsList, searchQuery };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "hard-delete") {
    const jobId = Number(formData.get("jobId"));
    if (!jobId) {
      return { success: false, error: "Invalid job ID." };
    }

    const job = await getJobById(jobId);
    if (!job) {
      return { success: false, error: "Job not found." };
    }

    await deleteJob(jobId);
    const url = new URL(request.url);
    return redirect(`${url.pathname}${url.search}`);
  }

  return { success: false, error: "Unknown action." };
}

export default function ManageJobsIndex() {
  const { jobs } = useLoaderData<typeof loader>();

  return (
    <ManagePage
      title="Jobs"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/manage/import/jobs"
            className="px-4 py-2 bg-harbour-100 hover:bg-harbour-200 text-harbour-700 font-medium transition-colors"
          >
            Import Sources
          </Link>
          <Link
            to="/manage/jobs/new"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
          >
            New Manual Job
          </Link>
        </div>
      }
    >
      <SearchInput placeholder="Search jobs..." />

      {jobs.length === 0 ? (
        <ManageListEmpty>
          No job listings yet. Create a manual job or set up import sources.
        </ManageListEmpty>
      ) : (
        <ManageList>
          {jobs.map((job) => (
            <ManageListItem key={job.id}>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium truncate text-harbour-700">{job.title}</h2>
                  {job.sourceType === "imported" && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700">Imported</span>
                  )}
                  {job.sourceType === "manual" && (
                    <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700">Manual</span>
                  )}
                  {job.workplaceType === "remote" && (
                    <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-700">
                      Remote
                    </span>
                  )}
                  {job.status !== "active" && (
                    <span
                      className={`text-xs px-1.5 py-0.5 ${
                        job.status === "hidden"
                          ? "bg-amber-100 text-amber-700"
                          : job.status === "removed"
                            ? "bg-red-100 text-red-700"
                            : "bg-harbour-100 text-harbour-600"
                      }`}
                    >
                      {job.status}
                    </span>
                  )}
                </div>
                <p className="text-sm text-harbour-400">
                  {job.companyName && `${job.companyName} - `}
                  {job.location && `${job.location} - `}
                  {job.postedAt && `Posted ${format(job.postedAt, "MMM d, yyyy")}`}
                </p>
              </div>

              <ManageListActions>
                {job.sourceType === "manual" ? (
                  <>
                    <Link
                      to={`/manage/jobs/${job.id}`}
                      className="px-3 py-1.5 text-sm font-medium text-harbour-600 hover:bg-harbour-50 transition-colors"
                    >
                      Edit
                    </Link>
                    <Link
                      to={`/manage/jobs/${job.id}/delete`}
                      className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </Link>
                  </>
                ) : (
                  <>
                    {job.url && (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-sm font-medium text-harbour-600 hover:bg-harbour-50 transition-colors"
                      >
                        View
                      </a>
                    )}
                    {job.sourceId && (
                      <Link
                        to={`/manage/import/jobs/${job.sourceId}`}
                        className="px-3 py-1.5 text-sm font-medium text-harbour-600 hover:bg-harbour-50 transition-colors"
                      >
                        Source
                      </Link>
                    )}
                    <Form
                      method="post"
                      onSubmit={(e) => {
                        if (!confirm(`Hard delete "${job.title}"? This cannot be undone.`)) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="intent" value="hard-delete" />
                      <input type="hidden" name="jobId" value={job.id} />
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Hard Delete
                      </button>
                    </Form>
                  </>
                )}
              </ManageListActions>
            </ManageListItem>
          ))}
        </ManageList>
      )}
    </ManagePage>
  );
}
