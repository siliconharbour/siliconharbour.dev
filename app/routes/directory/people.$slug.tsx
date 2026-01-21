import type { Route } from "./+types/people.$slug";
import { Link, useLoaderData } from "react-router";
import { getPersonBySlug } from "~/lib/people.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { getOptionalUser } from "~/lib/session.server";
import { RichMarkdown } from "~/components/RichMarkdown";
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
  
  const [resolvedRefs, backlinks] = await Promise.all([
    prepareRefsForClient(person.bio),
    getDetailedBacklinks("person", person.id),
  ]);
  
  // Parse social links if present
  let socialLinks: Record<string, string> = {};
  if (person.socialLinks) {
    try {
      socialLinks = JSON.parse(person.socialLinks);
    } catch {
      // ignore parse errors
    }
  }
  
  return { person, resolvedRefs, backlinks, socialLinks, isAdmin };
}

export default function PersonDetail() {
  const { person, resolvedRefs, backlinks, socialLinks, isAdmin } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      {!person.visible && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
            <span className="text-amber-800 font-medium">This page is hidden from public listings</span>
          </div>
          {isAdmin && (
            <Link
              to={`/manage/people/${person.id}`}
              className="text-sm px-3 py-1 bg-amber-200 text-amber-800 hover:bg-amber-300 transition-colors"
            >
              Edit visibility
            </Link>
          )}
        </div>
      )}
      <article className="flex flex-col gap-6">
        <div className="flex items-start gap-4">
          {person.avatar ? (
            <div className="w-24 h-24 relative overflow-hidden bg-harbour-100 flex-shrink-0">
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
          <div className="flex flex-col gap-2 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-harbour-700">{person.name}</h1>
              {isAdmin && (
                <Link
                  to={`/manage/people/${person.id}`}
                  className="p-1.5 text-harbour-400 hover:text-harbour-600 hover:bg-harbour-100 transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </Link>
              )}
            </div>
            
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

        <div className="prose">
          <RichMarkdown content={person.bio} resolvedRefs={resolvedRefs} />
        </div>

        <ReferencedBy backlinks={backlinks} />
      </article>
    </div>
  );
}
