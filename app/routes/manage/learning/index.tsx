import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getAllLearning } from "~/lib/learning.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Learning - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const institutions = await getAllLearning();
  return { institutions };
}

const typeLabels: Record<string, string> = {
  university: "University",
  college: "College",
  bootcamp: "Bootcamp",
  online: "Online",
  other: "Other",
};

export default function ManageLearningIndex() {
  const { institutions } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">Learning</h1>
          <Link
            to="/manage/learning/new"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
          >
            New Institution
          </Link>
        </div>

        {institutions.length === 0 ? (
          <div className="text-center p-12 text-harbour-400">
            No learning institutions yet. Create your first one to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {institutions.map((inst) => (
              <div
                key={inst.id}
                className="flex items-center gap-4 p-4 bg-white border border-harbour-200"
              >
                {inst.logo ? (
                  <img
                    src={`/images/${inst.logo}`}
                    alt=""
                    className="w-12 h-12 object-contain"
                  />
                ) : (
                  <div className="w-12 h-12 bg-harbour-100" />
                )}

                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <h2 className="font-medium truncate text-harbour-700">{inst.name}</h2>
                  <p className="text-sm text-harbour-400">{typeLabels[inst.type] ?? inst.type}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/manage/learning/${inst.id}`}
                    className="px-3 py-1.5 text-sm font-medium text-harbour-600 hover:bg-harbour-50 transition-colors"
                  >
                    Edit
                  </Link>
                  <Link
                    to={`/manage/learning/${inst.id}/delete`}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <Link
            to="/manage"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
