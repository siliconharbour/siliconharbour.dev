import type { Route } from "./+types/education";
import { useLoaderData } from "react-router";
import { getPaginatedEducation } from "~/lib/education.server";
import { getOptionalUser } from "~/lib/session.server";
import { DirectoryListPage } from "~/components/directory/DirectoryListPage";
import { parsePublicListParams } from "~/lib/public-query.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Education - Directory - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset, searchQuery } = parsePublicListParams(url);

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const { items, total } = await getPaginatedEducation(limit, offset, searchQuery);
  return { items, total, limit, offset, searchQuery, isAdmin };
}

const typeLabels: Record<string, string> = {
  university: "University",
  college: "College",
  bootcamp: "Bootcamp",
  online: "Online",
  other: "Other",
};

export default function DirectoryEducation() {
  const { items, total, limit, offset, searchQuery, isAdmin } = useLoaderData<typeof loader>();

  return (
    <DirectoryListPage
      isAdmin={isAdmin}
      adminCreateTo="/manage/education/new"
      adminCreateLabel="New Education Resource"
      searchPlaceholder="Search education resources..."
      searchQuery={searchQuery}
      total={total}
      limit={limit}
      offset={offset}
      emptyMessage="No education resources listed yet."
      emptySearchMessage="No education resources match your search."
      hasItems={items.length > 0}
    >
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <a
              key={item.id}
              href={`/directory/education/${item.slug}`}
              className="group flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 focus:ring-harbour-400 transition-all"
            >
              {item.logo ? (
                <div className="w-16 h-16 relative overflow-hidden bg-harbour-100">
                  <img
                    src={`/images/${item.logo}`}
                    alt=""
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 bg-harbour-100 flex items-center justify-center">
                  <span className="text-2xl text-harbour-400">{item.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <h2 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
                  {item.name}
                </h2>
                <p className="text-sm text-harbour-400">{typeLabels[item.type] ?? item.type}</p>
              </div>
            </a>
          ))}
        </div>
      </>
    </DirectoryListPage>
  );
}
