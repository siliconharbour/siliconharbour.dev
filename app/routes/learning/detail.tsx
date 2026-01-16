import type { Route } from "./+types/detail";
import { useLoaderData } from "react-router";
import { getLearningBySlug } from "~/lib/learning.server";
import { prepareRefsForClient, getRichIncomingReferences } from "~/lib/references.server";
import { getPublicComments, getAllComments } from "~/lib/comments.server";
import { getTurnstileSiteKey } from "~/lib/turnstile.server";
import { getOptionalUser } from "~/lib/session.server";
import { PublicLayout } from "~/components/PublicLayout";
import { RichMarkdown } from "~/components/RichMarkdown";
import { CommentSection } from "~/components/CommentSection";

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
    getRichIncomingReferences("learning", institution.id),
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
    <PublicLayout>
      <div className="max-w-4xl mx-auto p-4 py-8">
        <article className="flex flex-col gap-6">
          {institution.coverImage && (
            <div className="img-tint aspect-video relative overflow-hidden bg-harbour-100">
              <img
                src={`/images/${institution.coverImage}`}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex items-start gap-4">
            {institution.logo && (
              <div className="img-tint w-20 h-20 relative overflow-hidden bg-harbour-100 flex-shrink-0">
                <img
                  src={`/images/${institution.logo}`}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <h1 className="text-3xl font-bold text-harbour-700">{institution.name}</h1>
              <p className="text-harbour-500">{typeLabels[institution.type] ?? institution.type}</p>
            </div>
          </div>

          <RichMarkdown content={institution.description} resolvedRefs={resolvedRefs} />

          {institution.website && (
            <a
              href={institution.website}
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

          {backlinks.length > 0 && (
            <div className="border-t border-harbour-200/50 pt-6">
              <h2 className="text-lg font-semibold text-harbour-700 mb-3">Referenced By</h2>
              <ul className="flex flex-col gap-2">
                {backlinks.map((link) => (
                  <li key={`${link.type}-${link.id}`}>
                    <a href={link.url} className="text-harbour-600 hover:text-harbour-700">
                      {link.name}
                    </a>
                    <span className="text-harbour-400 text-sm ml-2">({link.type})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CommentSection
            contentType="learning"
            contentId={institution.id}
            comments={comments}
            turnstileSiteKey={turnstileSiteKey}
            isAdmin={isAdmin}
          />
        </article>
      </div>
    </PublicLayout>
  );
}
