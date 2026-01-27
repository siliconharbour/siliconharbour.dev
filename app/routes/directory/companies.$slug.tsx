import type { Route } from "./+types/companies.$slug";
import { Link, useLoaderData } from "react-router";
import { getCompanyBySlug } from "~/lib/companies.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { getPublicComments, getAllComments } from "~/lib/comments.server";
import { getTurnstileSiteKey } from "~/lib/turnstile.server";
import { getOptionalUser } from "~/lib/session.server";
import { areCommentsEnabled } from "~/lib/config.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { CommentSection } from "~/components/CommentSection";
import { ReferencedBy } from "~/components/ReferencedBy";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.company?.name ?? "Company"} - siliconharbour.dev` }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const company = await getCompanyBySlug(params.slug);
  if (!company) {
    throw new Response("Company not found", { status: 404 });
  }

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const [resolvedRefs, backlinks, comments, commentsEnabled] = await Promise.all([
    prepareRefsForClient(company.description),
    getDetailedBacklinks("company", company.id),
    isAdmin ? getAllComments("company", company.id) : getPublicComments("company", company.id),
    areCommentsEnabled("companies"),
  ]);

  const turnstileSiteKey = getTurnstileSiteKey();

  return { company, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin, commentsEnabled };
}

export default function CompanyDetail() {
  const { company, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin, commentsEnabled } =
    useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      {!company.visible && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
            <span className="text-amber-800 font-medium">
              This page is hidden from public listings
            </span>
          </div>
          {isAdmin && (
            <Link
              to={`/manage/companies/${company.id}`}
              className="text-sm px-3 py-1 bg-amber-200 text-amber-800 hover:bg-amber-300 transition-colors"
            >
              Edit visibility
            </Link>
          )}
        </div>
      )}
      <article className="flex flex-col gap-6">
        {company.coverImage && (
          <div className="aspect-video relative overflow-hidden bg-harbour-100">
            <img
              src={`/images/${company.coverImage}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex items-start gap-4">
          {company.logo ? (
            <div className="w-20 h-20 relative overflow-hidden bg-harbour-100 flex-shrink-0">
              <img
                src={`/images/${company.logo}`}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-20 h-20 bg-harbour-100 flex items-center justify-center flex-shrink-0">
              <span className="text-3xl text-harbour-400">{company.name.charAt(0)}</span>
            </div>
          )}
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-harbour-700">{company.name}</h1>
              {isAdmin && (
                <Link
                  to={`/manage/companies/${company.id}`}
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
            {company.location && <p className="text-harbour-500">{company.location}</p>}
            {company.founded && (
              <p className="text-sm text-harbour-400">Founded {company.founded}</p>
            )}
          </div>
        </div>

        <div className="prose">
          <RichMarkdown content={company.description} resolvedRefs={resolvedRefs} />
        </div>

        {(company.website ||
          company.wikipedia ||
          company.github ||
          company.technl ||
          company.genesis) && (
          <div className="flex flex-wrap gap-3">
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-600 text-white font-medium hover:bg-harbour-700 transition-colors"
              >
                Visit Website
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
            {company.wikipedia && (
              <a
                href={company.wikipedia}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-100 text-harbour-700 font-medium hover:bg-harbour-200 transition-colors"
              >
                Wikipedia
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
            {company.github && (
              <a
                href={company.github}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-100 text-harbour-700 font-medium hover:bg-harbour-200 transition-colors"
              >
                GitHub
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
            {company.technl && (
              <a
                href={`https://members.technl.ca/memberdirectory/Find?term=${encodeURIComponent(company.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-100 text-harbour-700 font-medium hover:bg-harbour-200 transition-colors"
              >
                TechNL Directory
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
            {company.genesis && (
              <a
                href="https://www.genesiscentre.ca/portfolio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-100 text-harbour-700 font-medium hover:bg-harbour-200 transition-colors"
              >
                Genesis Centre
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
          </div>
        )}

        <ReferencedBy backlinks={backlinks} />

        {commentsEnabled && (
          <CommentSection
            contentType="company"
            contentId={company.id}
            comments={comments}
            turnstileSiteKey={turnstileSiteKey}
            isAdmin={isAdmin}
          />
        )}
      </article>
    </div>
  );
}
