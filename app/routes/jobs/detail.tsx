import type { Route } from "./+types/detail";
import { Link, useLoaderData } from "react-router";
import { getJobBySlug } from "~/lib/jobs.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { getOptionalUser } from "~/lib/session.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { ReferencedBy } from "~/components/ReferencedBy";
import { format } from "date-fns";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.job?.title ?? "Job"} - siliconharbour.dev` }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const job = await getJobBySlug(params.slug);
  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const resolvedRefs = await prepareRefsForClient(job.description);
  const backlinks = await getDetailedBacklinks("job", job.id);

  return { job, resolvedRefs, backlinks, isAdmin };
}

export default function JobDetail() {
  const { job, resolvedRefs, backlinks, isAdmin } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-[60ch] mx-auto p-4 py-8">
      <article className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">{job.title}</h1>
            {isAdmin && (
              <Link
                to={`/manage/jobs/${job.id}`}
                className="p-1.5 text-harbour-400 hover:text-harbour-600 hover:bg-harbour-100 transition-colors"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </Link>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-harbour-500">
            {job.companyName && <span className="font-medium">{job.companyName}</span>}
            {job.location && <span>{job.location}</span>}
            {job.remote && (
              <span className="px-2 py-0.5 bg-harbour-100 text-harbour-600 text-sm">Remote</span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-harbour-400">
            <span>Posted {format(job.postedAt, "MMMM d, yyyy")}</span>
            {job.expiresAt && <span>Expires {format(job.expiresAt, "MMMM d, yyyy")}</span>}
            {job.salaryRange && <span>{job.salaryRange}</span>}
          </div>
        </div>

        <div className="prose">
          <RichMarkdown content={job.description} resolvedRefs={resolvedRefs} />
        </div>

        <a
          href={job.applyLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-600 text-white font-medium hover:bg-harbour-700 transition-colors self-start"
        >
          Apply Now
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>

        <ReferencedBy backlinks={backlinks} />
      </article>
    </div>
  );
}
