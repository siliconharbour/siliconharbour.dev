import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getJobById, updateJob } from "~/lib/jobs.server";
import { db } from "~/db";
import { companies } from "~/db/schema";
import { asc } from "drizzle-orm";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.job?.title || "Job"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid ID", { status: 400 });
  }

  const job = await getJobById(id);
  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  // Only allow editing manual jobs
  if (job.sourceType !== "manual") {
    throw new Response("Cannot edit imported jobs", { status: 403 });
  }

  // Get all companies for the dropdown
  const companyList = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));

  return { job, companies: companyList };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return { error: "Invalid ID" };
  }

  const existing = await getJobById(id);
  if (!existing) {
    return { error: "Job not found" };
  }

  if (existing.sourceType !== "manual") {
    return { error: "Cannot edit imported jobs" };
  }

  const formData = await request.formData();

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const companyIdStr = formData.get("companyId") as string;
  const location = (formData.get("location") as string) || null;
  const department = (formData.get("department") as string) || null;
  const workplaceType = (formData.get("workplaceType") as string) || null;
  const salaryRange = (formData.get("salaryRange") as string) || null;
  const url = formData.get("url") as string;

  if (!title || !description || !url) {
    return { error: "Title, description, and apply link are required" };
  }

  const companyId = companyIdStr ? parseInt(companyIdStr, 10) : null;

  await updateJob(id, {
    title,
    description,
    companyId: companyId || null,
    location,
    department,
    workplaceType: workplaceType as "remote" | "onsite" | "hybrid" | null,
    salaryRange,
    url,
  });

  return redirect("/manage/jobs");
}

export default function EditJob() {
  const { job, companies } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/jobs" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Jobs
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Edit Job</h1>

        {actionData?.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">{actionData.error}</div>
        )}

        <Form method="post" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="title" className="font-medium text-harbour-700">
              Job Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              required
              defaultValue={job.title}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="companyId" className="font-medium text-harbour-700">
              Company
            </label>
            <select
              id="companyId"
              name="companyId"
              defaultValue={job.companyId ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
              <option value="">-- Select a company (optional) --</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="font-medium text-harbour-700">
              Description * (Markdown)
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={10}
              defaultValue={job.description ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="location" className="font-medium text-harbour-700">
                Location
              </label>
              <input
                type="text"
                id="location"
                name="location"
                defaultValue={job.location ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="department" className="font-medium text-harbour-700">
                Department
              </label>
              <input
                type="text"
                id="department"
                name="department"
                defaultValue={job.department ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="workplaceType" className="font-medium text-harbour-700">
                Workplace Type
              </label>
              <select
                id="workplaceType"
                name="workplaceType"
                defaultValue={job.workplaceType ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                <option value="">-- Select --</option>
                <option value="onsite">On-site</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="salaryRange" className="font-medium text-harbour-700">
                Salary Range
              </label>
              <input
                type="text"
                id="salaryRange"
                name="salaryRange"
                defaultValue={job.salaryRange ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="url" className="font-medium text-harbour-700">
              Apply Link *
            </label>
            <input
              type="url"
              id="url"
              name="url"
              required
              defaultValue={job.url ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Update Job
          </button>
        </Form>
      </div>
    </div>
  );
}
