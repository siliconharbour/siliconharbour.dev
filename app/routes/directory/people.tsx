import type { Route } from "./+types/people";
import { useLoaderData } from "react-router";
import { getPaginatedPeople } from "~/lib/people.server";
import { getOptionalUser } from "~/lib/session.server";
import { DirectoryListPage } from "~/components/directory/DirectoryListPage";
import { parsePublicListParams } from "~/lib/public-query.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "People - Directory - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset, searchQuery } = parsePublicListParams(url);

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const { items: people, total } = await getPaginatedPeople(limit, offset, searchQuery);

  return { people, total, limit, offset, searchQuery, isAdmin };
}

export default function DirectoryPeople() {
  const { people, total, limit, offset, searchQuery, isAdmin } = useLoaderData<typeof loader>();

  return (
    <DirectoryListPage
      isAdmin={isAdmin}
      adminCreateTo="/manage/people/new"
      adminCreateLabel="New Person"
      searchPlaceholder="Search people..."
      searchQuery={searchQuery}
      total={total}
      limit={limit}
      offset={offset}
      emptyMessage="No people listed yet."
      emptySearchMessage="No people match your search."
      hasItems={people.length > 0}
    >
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {people.map((person) => (
            <a
              key={person.id}
              href={`/directory/people/${person.slug}`}
              className="group flex items-center gap-4 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 focus:ring-harbour-400 transition-all"
            >
              {person.avatar ? (
                <div className="w-16 h-16 relative overflow-hidden bg-harbour-100 flex-shrink-0">
                  <img
                    src={`/images/${person.avatar}`}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 bg-harbour-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl text-harbour-400">{person.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <h2 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
                  {person.name}
                </h2>
              </div>
            </a>
          ))}
        </div>
      </>
    </DirectoryListPage>
  );
}
