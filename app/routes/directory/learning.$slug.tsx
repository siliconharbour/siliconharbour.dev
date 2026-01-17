import type { Route } from "./+types/learning.$slug";
import { Link, useLoaderData } from "react-router";
import { getLearningBySlug } from "~/lib/learning.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { getPublicComments, getAllComments } from "~/lib/comments.server";
import { getTurnstileSiteKey } from "~/lib/turnstile.server";
import { getOptionalUser } from "~/lib/session.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { CommentSection } from "~/components/CommentSection";
import { ReferencedBy } from "~/components/ReferencedBy";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `${data?.institution?.name ?? "Learning"} - siliconharbour.dev` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const institution = await getLearningBySlug(params.slug);
  if (!institution) {
    throw new Response("Institution not found", { status: 404 });
  }
  
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";
  
  const [resolvedRefs, backlinks, comments] = await Promise.all([
    prepareRefsForClient(institution.description),
    getDetailedBacklinks("learning", institution.id),
    isAdmin ? getAllComments("learning", institution.id) : getPublicComments("learning", institution.id),
  ]);
  
  const turnstileSiteKey = getTurnstileSiteKey();
  
  return { institution, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin };
}

export default function LearningDetail() {
  const { institution, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin } = useLoaderData<typeof loader>();

  const typeLabels: Record<string, string> = {
    university: "University",
    college: "College",
    bootcamp: "Bootcamp",
    online: "Online",
    other: "Other",
  };

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="flex flex-col gap-6">
        {institution.coverImage && (
          <div className="aspect-video relative overflow-hidden bg-harbour-100">
            <img
              src={`/images/${institution.coverImage}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex items-start gap-4">
          {institution.logo && (
            <div className="w-20 h-20 relative overflow-hidden bg-harbour-100 flex-shrink-0">
              <img
                src={`/images/${institution.logo}`}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          )}
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-harbour-700">{institution.name}</h1>
              {isAdmin && (
                <Link
                  to={`/manage/learning/${institution.id}`}
                  className="p-1.5 text-harbour-400 hover:text-harbour-600 hover:bg-harbour-100 transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </Link>
              )}
            </div>
            <p className="text-harbour-500">{typeLabels[institution.type] ?? institution.type}</p>
          </div>
        </div>

        <RichMarkdown content={institution.description} resolvedRefs={resolvedRefs} />

        {(institution.website || institution.technl || institution.genesis) && (
          <div className="flex flex-wrap gap-3">
            {institution.website && (
              <a
                href={institution.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-600 text-white font-medium hover:bg-harbour-700 transition-colors"
              >
                Visit Website
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
            {institution.technl && (
              <a
                href={`https://members.technl.ca/memberdirectory/Find?term=${encodeURIComponent(institution.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-100 text-harbour-700 font-medium hover:bg-harbour-200 transition-colors"
              >
                TechNL Directory
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
            {institution.genesis && (
              <a
                href="https://www.genesiscentre.ca/portfolio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-100 text-harbour-700 font-medium hover:bg-harbour-200 transition-colors"
              >
                Genesis Centre
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        )}

        <ReferencedBy backlinks={backlinks} />

        <CommentSection
          contentType="learning"
          contentId={institution.id}
          comments={comments}
          turnstileSiteKey={turnstileSiteKey}
          isAdmin={isAdmin}
        />
      </article>
    </div>
  );
}
