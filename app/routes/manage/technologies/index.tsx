import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getTechnologiesByCategory } from "~/lib/technologies.server";
import { categoryLabels, technologyCategories } from "~/lib/technology-categories";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Technologies - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const byCategory = await getTechnologiesByCategory(true);
  return { byCategory };
}

export default function ManageTechnologiesIndex() {
  const { byCategory } = useLoaderData<typeof loader>();

  const totalCount = Object.values(byCategory).flat().length;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-harbour-700">Technologies</h1>
            <span className="px-2 py-0.5 bg-harbour-100 text-harbour-600 text-sm">
              {totalCount}
            </span>
          </div>
          <Link
            to="/manage/technologies/new"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
          >
            New Technology
          </Link>
        </div>

        {totalCount === 0 ? (
          <div className="text-center p-12 text-harbour-400">
            No technologies yet. Create your first technology to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {technologyCategories.map((category) => {
              const techs = byCategory[category];
              if (techs.length === 0) return null;

              return (
                <div key={category} className="flex flex-col gap-3">
                  <h2 className="text-lg font-medium text-harbour-600 border-b border-harbour-200 pb-2">
                    {categoryLabels[category]}
                    <span className="ml-2 text-sm text-harbour-400">({techs.length})</span>
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {techs.map((tech) => (
                      <Link
                        key={tech.id}
                        to={`/manage/technologies/${tech.id}`}
                        className={`flex items-center gap-2 px-3 py-2 border transition-colors ${
                          tech.visible
                            ? "bg-white border-harbour-200 hover:border-harbour-400"
                            : "bg-amber-50 border-amber-200 hover:border-amber-400"
                        }`}
                      >
                        {tech.icon && (
                          <img
                            src={`/images/${tech.icon}`}
                            alt=""
                            className="w-5 h-5 object-contain"
                          />
                        )}
                        <span className="text-sm text-harbour-700 truncate">{tech.name}</span>
                        {!tech.visible && (
                          <span className="text-xs px-1 py-0.5 bg-amber-200 text-amber-700">
                            Hidden
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div>
          <Link to="/manage" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
