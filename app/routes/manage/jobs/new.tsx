import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { createJob } from "~/lib/jobs.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Job - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const companyName = (formData.get("companyName") as string) || null;
  const location = (formData.get("location") as string) || null;
  const remote = formData.get("remote") === "1";
  const salaryRange = (formData.get("salaryRange") as string) || null;
  const applyLink = formData.get("applyLink") as string;
  const expiresAtStr = formData.get("expiresAt") as string;

  if (!title || !description || !applyLink) {
    return { error: "Title, description, and apply link are required" };
  }

  let expiresAt: Date | null = null;
  if (expiresAtStr) {
    expiresAt = new Date(expiresAtStr);
  }

  await createJob({
    title,
    description,
    companyName,
    location,
    remote,
    salaryRange,
    applyLink,
    expiresAt,
  });

  return redirect("/manage/jobs");
}

export default function NewJob() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/jobs" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Jobs
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">New Job</h1>

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
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="companyName" className="font-medium text-harbour-700">
              Company Name
            </label>
            <input
              type="text"
              id="companyName"
              name="companyName"
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
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
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="salaryRange" className="font-medium text-harbour-700">
                Salary Range
              </label>
              <input
                type="text"
                id="salaryRange"
                name="salaryRange"
                placeholder="e.g., $80k-$100k"
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="remote" name="remote" value="1" className="w-4 h-4" />
            <label htmlFor="remote" className="text-harbour-700">
              Remote position
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="applyLink" className="font-medium text-harbour-700">
              Apply Link *
            </label>
            <input
              type="url"
              id="applyLink"
              name="applyLink"
              required
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="expiresAt" className="font-medium text-harbour-700">
              Expires On (optional)
            </label>
            <input
              type="date"
              id="expiresAt"
              name="expiresAt"
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Create Job
          </button>
        </Form>
      </div>
    </div>
  );
}
