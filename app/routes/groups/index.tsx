import type { Route } from "./+types/index";
import { useLoaderData } from "react-router";
import { getAllGroups } from "~/lib/groups.server";
import { PublicLayout } from "~/components/PublicLayout";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Groups - siliconharbour.dev" },
    { name: "description", content: "Tech groups and meetups in St. John's" },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const groups = await getAllGroups();
  return { groups };
}

export default function GroupsIndex() {
  const { groups } = useLoaderData<typeof loader>();

  return (
    <PublicLayout>
      <div className="max-w-6xl mx-auto p-4 py-8">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">Groups</h1>
            <p className="text-harbour-500">Meetups and community organizations</p>
          </div>

          {groups.length === 0 ? (
            <p className="text-harbour-400">No groups listed yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map((group) => (
                <a
                  key={group.id}
                  href={`/groups/${group.slug}`}
                  className="group flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all no-underline"
                >
                  {group.logo && (
                    <div className="img-tint w-16 h-16 relative overflow-hidden bg-harbour-100">
                      <img
                        src={`/images/${group.logo}`}
                        alt=""
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <h2 className="font-semibold text-harbour-700 group-hover:text-harbour-600">
                      {group.name}
                    </h2>
                    {group.meetingFrequency && (
                      <p className="text-sm text-harbour-400">{group.meetingFrequency}</p>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
