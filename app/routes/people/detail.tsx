import type { Route } from "./+types/detail";
import { useLoaderData } from "react-router";
import { getPersonBySlug } from "~/lib/people.server";
import { prepareRefsForClient, getRichIncomingReferences } from "~/lib/references.server";
import { getPublicComments, getAllComments } from "~/lib/comments.server";
import { getTurnstileSiteKey } from "~/lib/turnstile.server";
import { getOptionalUser } from "~/lib/session.server";
import { PublicLayout } from "~/components/PublicLayout";
import { RichMarkdown } from "~/components/RichMarkdown";
import { CommentSection } from "~/components/CommentSection";

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
    getRichIncomingReferences("person", person.id),
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
    <PublicLayout>
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
                {socialLinks.github && (
                  <a
                    href={socialLinks.github}
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
            contentType="person"
            contentId={person.id}
            comments={comments}
            turnstileSiteKey={turnstileSiteKey}
            isAdmin={isAdmin}
          />
        </article>
      </div>
    </PublicLayout>
  );
}
