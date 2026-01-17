import type { Route } from "./+types/people.$slug";
import { useLoaderData } from "react-router";
import { getPersonBySlug } from "~/lib/people.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { getPublicComments, getAllComments } from "~/lib/comments.server";
import { getTurnstileSiteKey } from "~/lib/turnstile.server";
import { getOptionalUser } from "~/lib/session.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { CommentSection } from "~/components/CommentSection";
import { ReferencedBy } from "~/components/ReferencedBy";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `${data?.person?.name ?? "Person"} - siliconharbour.dev` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const person = await getPersonBySlug(params.slug);
  if (!person) {
    throw new Response("Person not found", { status: 404 });
  }
  
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";
  
  const [resolvedRefs, backlinks, comments] = await Promise.all([
    prepareRefsForClient(person.bio),
    getDetailedBacklinks("person", person.id),
    isAdmin ? getAllComments("person", person.id) : getPublicComments("person", person.id),
  ]);
  
  const turnstileSiteKey = getTurnstileSiteKey();
  
  // Parse social links if present
  let socialLinks: Record<string, string> = {};
  if (person.socialLinks) {
    try {
      socialLinks = JSON.parse(person.socialLinks);
    } catch {
      // ignore parse errors
    }
  }
  
  return { person, resolvedRefs, backlinks, socialLinks, comments, turnstileSiteKey, isAdmin };
}

export default function PersonDetail() {
  const { person, resolvedRefs, backlinks, socialLinks, comments, turnstileSiteKey, isAdmin } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="flex flex-col gap-6">
        <div className="flex items-start gap-4">
          {person.avatar ? (
            <div className="img-tint w-24 h-24 relative overflow-hidden bg-harbour-100 flex-shrink-0">
              <img
                src={`/images/${person.avatar}`}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-24 h-24 bg-harbour-100 flex items-center justify-center flex-shrink-0">
              <span className="text-4xl text-harbour-400">{person.name.charAt(0)}</span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">{person.name}</h1>
            
            <div className="flex flex-wrap gap-3">
              {person.website && (
                <a
                  href={person.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-harbour-600 hover:text-harbour-700 text-sm"
                >
                  Website
                </a>
              )}
              {(person.github || socialLinks.github) && (
                <a
                  href={person.github || socialLinks.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-harbour-600 hover:text-harbour-700 text-sm"
                >
                  GitHub
                </a>
              )}
              {socialLinks.twitter && (
                <a
                  href={socialLinks.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-harbour-600 hover:text-harbour-700 text-sm"
                >
                  Twitter
                </a>
              )}
              {socialLinks.linkedin && (
                <a
                  href={socialLinks.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-harbour-600 hover:text-harbour-700 text-sm"
                >
                  LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>

        <RichMarkdown content={person.bio} resolvedRefs={resolvedRefs} />

        <ReferencedBy backlinks={backlinks} />

        <CommentSection
          contentType="person"
          contentId={person.id}
          comments={comments}
          turnstileSiteKey={turnstileSiteKey}
          isAdmin={isAdmin}
        />
      </article>
    </div>
  );
}
