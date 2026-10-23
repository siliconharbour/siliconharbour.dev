import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getTechnologiesByCategory } from "~/lib/technologies.server";
import { categoryLabels, technologyCategories } from "~/lib/technology-categories";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Technologies - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const byCategory = await getTechnologiesByCategory(true);
  return { byCategory };
}

export default function ManageTechnologiesIndex() {
  const { byCategory } = useLoaderData<typeof loader>();

  const totalCount = Object.values(byCategory).flat().length;

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-gap-3">
            <h1 className="text-2xl font-semibold text-heading">Technologies</h1>
            <span className="px-pad-2 py-pad-0-5 bg-tint text-body text-sm">{totalCount}</span>
          </div>
          <Link
            to="/manage/technologies/new"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
          >
            New Technology
          </Link>
        </div>

        {totalCount === 0 ? (
          <div className="text-center p-pad-12 text-subtle">
            No technologies yet. Create your first technology to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-gap-8">
            {technologyCategories.map((category) => {
              const techs = byCategory[category];
              if (techs.length === 0) return null;

              return (
                <div key={category} className="flex flex-col gap-gap-3">
                  <h2 className="text-lg font-medium text-body border-b border-line pb-pad-2">
                    {categoryLabels[category]}
                    <span className="ml-2 text-sm text-subtle">({techs.length})</span>
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-gap-2">
                    {techs.map((tech) => (
                      <Link
                        key={tech.id}
                        to={`/manage/technologies/${tech.id}`}
                        className={`flex items-center gap-gap-2 px-pad-3 py-pad-2 border transition-colors ${
                          tech.visible
                            ? "bg-surface border-line hover:border-harbour-400"
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
                        <span className="text-sm text-heading truncate">{tech.name}</span>
                        {!tech.visible && (
                          <span className="text-xs px-pad-1 py-pad-0-5 bg-amber-200 text-amber-700">
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
          <Link to="/manage" className="text-sm text-subtle hover:text-body">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
