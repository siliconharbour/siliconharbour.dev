import type { Route } from "./+types/detail";
import { useLoaderData } from "react-router";
import { getCompanyBySlug } from "~/lib/companies.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { getPublicComments, getAllComments } from "~/lib/comments.server";
import { getTurnstileSiteKey } from "~/lib/turnstile.server";
import { getOptionalUser } from "~/lib/session.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { CommentSection } from "~/components/CommentSection";
import { ReferencedBy } from "~/components/ReferencedBy";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `${data?.company?.name ?? "Company"} - siliconharbour.dev` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const company = await getCompanyBySlug(params.slug);
  if (!company) {
    throw new Response("Company not found", { status: 404 });
  }
  
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";
  
  const [resolvedRefs, backlinks, comments] = await Promise.all([
    prepareRefsForClient(company.description),
    getDetailedBacklinks("company", company.id),
    isAdmin ? getAllComments("company", company.id) : getPublicComments("company", company.id),
  ]);
  
  const turnstileSiteKey = getTurnstileSiteKey();
  
  return { company, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin };
}

export default function CompanyDetail() {
  const { company, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="flex flex-col gap-6">
        {company.coverImage && (
          <div className="img-tint aspect-video relative overflow-hidden bg-harbour-100">
            <img
              src={`/images/${company.coverImage}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex items-start gap-4">
          {company.logo && (
            <div className="img-tint w-20 h-20 relative overflow-hidden bg-harbour-100 flex-shrink-0">
              <img
                src={`/images/${company.logo}`}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold text-harbour-700">{company.name}</h1>
            {company.location && (
              <p className="text-harbour-500">{company.location}</p>
            )}
            {company.founded && (
              <p className="text-sm text-harbour-400">Founded {company.founded}</p>
            )}
          </div>
        </div>

        <RichMarkdown content={company.description} resolvedRefs={resolvedRefs} />

        {company.website && (
          <a
            href={company.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-600 text-white font-medium hover:bg-harbour-700 transition-colors no-underline self-start"
          >
            Visit Website
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}

        <ReferencedBy backlinks={backlinks} />

        <CommentSection
          contentType="company"
          contentId={company.id}
          comments={comments}
          turnstileSiteKey={turnstileSiteKey}
          isAdmin={isAdmin}
        />
      </article>
    </div>
  );
}
