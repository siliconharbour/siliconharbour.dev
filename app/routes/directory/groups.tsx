import type { Route } from "./+types/groups";
import { useLoaderData } from "react-router";
import { getPaginatedGroups } from "~/lib/groups.server";
import { getOptionalUser } from "~/lib/session.server";
import { DirectoryListPage } from "~/components/directory/DirectoryListPage";
import { parsePublicListParams } from "~/lib/public-query.server";
import { buildSeoMeta } from "~/lib/seo";

export function meta({}: Route.MetaArgs) {
  return buildSeoMeta({
    title: "Tech Groups & Meetups in St. John's, NL",
    description:
      "Community tech groups, meetups, and organizations in St. John's, Newfoundland. Find local developer groups, clubs, and tech communities.",
    url: "/directory/groups",
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset, searchQuery } = parsePublicListParams(url);

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const { items, total } = await getPaginatedGroups(limit, offset, searchQuery);
  return { items, total, limit, offset, searchQuery, isAdmin };
}

export default function DirectoryGroups() {
  const { items, total, limit, offset, searchQuery, isAdmin } = useLoaderData<typeof loader>();

  return (
    <DirectoryListPage
      isAdmin={isAdmin}
      adminCreateTo="/manage/groups/new"
      adminCreateLabel="New Group"
      searchPlaceholder="Search groups..."
      searchQuery={searchQuery}
      total={total}
      limit={limit}
      offset={offset}
      emptyMessage="No groups listed yet."
      emptySearchMessage="No groups match your search."
      hasItems={items.length > 0}
    >
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gap-4">
          {items.map((group) => (
            <a
              key={group.id}
              href={`/directory/groups/${group.slug}`}
              className="group flex flex-col gap-gap-3 p-pad-4 card-link"
            >
              {group.logo ? (
                <div className="w-16 h-16 relative overflow-hidden">
                  <img
                    src={`/images/${group.logo}`}
                    alt=""
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 bg-tint flex items-center justify-center">
                  <span className="text-2xl text-subtle">{group.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex flex-col gap-gap-1">
                <h2 className="link-title font-semibold text-heading group-hover:text-body">
                  {group.name}
                </h2>
                {group.meetingFrequency && (
                  <p className="text-sm text-subtle">{group.meetingFrequency}</p>
                )}
              </div>
            </a>
          ))}
        </div>
      </>
    </DirectoryListPage>
  );
}
