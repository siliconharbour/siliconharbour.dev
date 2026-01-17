import type { Route } from "./+types/groups.$slug";
import { useLoaderData } from "react-router";
import { getGroupBySlug } from "~/lib/groups.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { getPublicComments, getAllComments } from "~/lib/comments.server";
import { getTurnstileSiteKey } from "~/lib/turnstile.server";
import { getOptionalUser } from "~/lib/session.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { CommentSection } from "~/components/CommentSection";
import { ReferencedBy } from "~/components/ReferencedBy";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `${data?.group?.name ?? "Group"} - siliconharbour.dev` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const group = await getGroupBySlug(params.slug);
  if (!group) {
    throw new Response("Group not found", { status: 404 });
  }
  
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";
  
  const [resolvedRefs, backlinks, comments] = await Promise.all([
    prepareRefsForClient(group.description),
    getDetailedBacklinks("group", group.id),
    isAdmin ? getAllComments("group", group.id) : getPublicComments("group", group.id),
  ]);
  
  const turnstileSiteKey = getTurnstileSiteKey();
  
  return { group, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin };
}

export default function GroupDetail() {
  const { group, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="flex flex-col gap-6">
        {group.coverImage && (
          <div className="img-tint aspect-video relative overflow-hidden bg-harbour-100">
            <img
              src={`/images/${group.coverImage}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex items-start gap-4">
          {group.logo && (
            <div className="img-tint w-20 h-20 relative overflow-hidden bg-harbour-100 flex-shrink-0">
              <img
                src={`/images/${group.logo}`}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold text-harbour-700">{group.name}</h1>
            {group.meetingFrequency && (
              <p className="text-harbour-500">Meets {group.meetingFrequency}</p>
            )}
          </div>
        </div>

        <RichMarkdown content={group.description} resolvedRefs={resolvedRefs} />

        {group.website && (
          <a
            href={group.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-600 text-white font-medium hover:bg-harbour-700 transition-colors self-start"
          >
            Visit Group
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}

        <ReferencedBy backlinks={backlinks} />

        <CommentSection
          contentType="group"
          contentId={group.id}
          comments={comments}
          turnstileSiteKey={turnstileSiteKey}
          isAdmin={isAdmin}
        />
      </article>
    </div>
  );
}
