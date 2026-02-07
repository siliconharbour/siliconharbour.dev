import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getJobById, deleteJob } from "~/lib/jobs.server";
import { parseIdOrThrow } from "~/lib/admin/route";
import { DeleteConfirmationCard } from "~/components/manage/DeleteConfirmationCard";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.job?.title || "Job"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "job");

  const job = await getJobById(id);
  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  // Only allow deleting manual jobs
  if (job.sourceType !== "manual") {
    throw new Response("Cannot delete imported jobs - use hide instead", { status: 403 });
  }

  return { job };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "job");

  // Verify it's a manual job before deleting
  const job = await getJobById(id);
  if (job && job.sourceType !== "manual") {
    throw new Response("Cannot delete imported jobs", { status: 403 });
  }

  await deleteJob(id);
  return redirect("/manage/jobs");
}

export default function DeleteJob() {
  const { job } = useLoaderData<typeof loader>();

  return (
    <DeleteConfirmationCard
      title="Delete Job"
      message={
        <>
          Are you sure you want to delete <strong>{job.title}</strong>? This action cannot be
          undone.
        </>
      }
    >
      <Form method="post" className="flex gap-4">
        <button
          type="submit"
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
        >
          Delete
        </button>
        <Link
          to="/manage/jobs"
          className="px-4 py-2 text-harbour-600 hover:bg-harbour-50 font-medium transition-colors"
        >
          Cancel
        </Link>
      </Form>
    </DeleteConfirmationCard>
  );
}
