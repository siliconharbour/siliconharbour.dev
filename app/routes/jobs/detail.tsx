import type { Route } from "./+types/detail";
import { Link, useLoaderData } from "react-router";
import { getJobBySlugWithCompany } from "~/lib/jobs.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { getOptionalUser } from "~/lib/session.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { ReferencedBy } from "~/components/ReferencedBy";
import { format } from "date-fns";
import { buildSeoMeta, stripMarkdown } from "~/lib/seo";

export function meta({ loaderData: data }: Route.MetaArgs) {
  const job = data?.job;
  const title = job?.title ?? "Job";
  const company = (job as { company?: { name?: string } } | undefined)?.company?.name;
  const companyStr = company ? ` at ${company}` : "";
  const rawDesc =
    (job as { descriptionText?: string } | undefined)?.descriptionText ??
    (job as { description?: string } | undefined)?.description;
  const description = rawDesc
    ? stripMarkdown(rawDesc)
    : `${title}${companyStr} — tech job in St. John's, NL.`;
  const slug = (job as { slug?: string } | undefined)?.slug ?? "";
  const postedAt = (job as { postedAt?: string | Date } | undefined)?.postedAt;
  const seoTags = buildSeoMeta({
    title: `${title}${companyStr}`,
    description,
    url: `/jobs/${slug}`,
  });

  // JobPosting JSON-LD for Google Jobs
  if (job) {
    const jobUrl = (job as { url?: string }).url ?? `https://siliconharbour.dev/jobs/${slug}`;
    const jsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title,
      description,
      datePosted: postedAt
        ? new Date(postedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "St. John's",
          addressRegion: "NL",
          addressCountry: "CA",
        },
      },
      url: jobUrl,
      directApply: true,
    };
    if (company) {
      jsonLd.hiringOrganization = { "@type": "Organization", name: company };
    }
    const workplaceType = (job as { workplaceType?: string }).workplaceType;
    if (workplaceType === "remote") jsonLd.jobLocationType = "TELECOMMUTE";
    seoTags.push({ "script:ld+json": JSON.stringify(jsonLd) });
  }

  return seoTags;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const job = await getJobBySlugWithCompany(params.slug);
  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  // Get description for markdown rendering (use description for manual jobs, descriptionText for imported)
  const description = job.description || job.descriptionText || "";
  const resolvedRefs = await prepareRefsForClient(description);
  const backlinks = await getDetailedBacklinks("job", job.id);

  return { job, resolvedRefs, backlinks, isAdmin };
}

export default function JobDetail() {
  const { job, resolvedRefs, backlinks, isAdmin } = useLoaderData<typeof loader>();

  // Determine description to display
  const description = job.description || job.descriptionText || "";
  const isHtml = !job.description && job.descriptionHtml;

  return (
    <div className="max-w-[60ch] mx-auto p-pad-4 py-pad-8">
      <article className="flex flex-col gap-gap-6">
        <div className="flex flex-col gap-gap-4">
          <div className="flex items-center gap-gap-2">
            <h1 className="text-3xl font-bold text-heading">{job.title}</h1>
            {isAdmin && job.sourceType === "manual" && (
              <Link
                to={`/manage/jobs/${job.id}`}
                className="p-pad-1-5 text-subtle hover:text-body hover:bg-tint transition-colors"
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

          <div className="flex flex-wrap gap-x-gap-4 gap-y-gap-2 text-muted">
            {job.company && (
              <Link
                to={`/directory/companies/${job.company.slug}`}
                className="font-medium hover:text-heading"
              >
                {job.company.name}
              </Link>
            )}
            {job.location && <span>{job.location}</span>}
            {job.department && <span>{job.department}</span>}
            {job.workplaceType && (
              <span
                className={`px-pad-2 py-pad-0-5 text-sm ${
                  job.workplaceType === "remote"
                    ? "bg-purple-100 text-purple-700"
                    : job.workplaceType === "hybrid"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-blue-100 text-blue-700"
                }`}
              >
                {job.workplaceType}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-gap-4 gap-y-gap-2 text-sm text-subtle">
            {job.postedAt && <span>Posted {format(job.postedAt, "MMMM d, yyyy")}</span>}
            {job.salaryRange && <span>{job.salaryRange}</span>}
          </div>
        </div>

        {isHtml ? (
          <div className="prose" dangerouslySetInnerHTML={{ __html: job.descriptionHtml! }} />
        ) : description ? (
          <div className="prose">
            <RichMarkdown content={description} resolvedRefs={resolvedRefs} />
          </div>
        ) : null}

        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-gap-2 px-pad-4 py-pad-2 bg-primary text-white font-medium hover:bg-primary-hover transition-colors self-start"
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
        )}

        <ReferencedBy backlinks={backlinks} />
      </article>
    </div>
  );
}
