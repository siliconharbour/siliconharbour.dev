import type { Route } from "./+types/technologies";
import { Link, useLoaderData } from "react-router";
import {
  getTechnologiesWithUsage,
  categoryLabels,
  technologyCategories,
  type TechnologyWithUsage,
} from "~/lib/technologies.server";
import { getOptionalUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Technologies - Directory - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const technologies = await getTechnologiesWithUsage();

  // Group by category
  const byCategory: Record<string, TechnologyWithUsage[]> = {};
  for (const tech of technologies) {
    if (!byCategory[tech.category]) {
      byCategory[tech.category] = [];
    }
    byCategory[tech.category].push(tech);
  }

  return { byCategory, isAdmin };
}

export default function DirectoryTechnologies() {
  const { byCategory, isAdmin } = useLoaderData<typeof loader>();

  const totalCount = Object.values(byCategory).flat().length;

  return (
    <div className="flex flex-col gap-6">
      {/* Admin create button */}
      {isAdmin && (
        <div className="flex justify-end">
          <Link
            to="/manage/technologies/new"
            className="px-3 py-1.5 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
          >
            + New Technology
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-harbour-500">
          Technologies used by companies in the local tech ecosystem. Click on a technology to see
          which companies use it.
        </p>
        <p className="text-sm text-harbour-400">
          {totalCount} technologies tracked across {technologyCategories.length} categories
        </p>
      </div>

      {totalCount === 0 ? (
        <p className="text-harbour-400">No technologies listed yet.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {technologyCategories.map((category) => {
            const techs = byCategory[category];
            if (!techs || techs.length === 0) return null;

            return (
              <div key={category} className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-harbour-700 border-b border-harbour-200 pb-2">
                  {categoryLabels[category]}
                  <span className="ml-2 text-sm font-normal text-harbour-400">
                    ({techs.length})
                  </span>
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {techs.map((tech) => (
                    <Link
                      key={tech.id}
                      to={`/directory/technologies/${tech.slug}`}
                      className="group flex flex-col gap-2 p-3 ring-1 ring-harbour-200/50 hover:ring-harbour-300 focus:ring-harbour-400 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        {tech.icon ? (
                          <img
                            src={`/images/${tech.icon}`}
                            alt=""
                            className="w-6 h-6 object-contain"
                          />
                        ) : (
                          <div className="w-6 h-6 bg-harbour-100 flex items-center justify-center">
                            <span className="text-xs text-harbour-400">{tech.name.charAt(0)}</span>
                          </div>
                        )}
                        <span className="font-medium text-harbour-700 group-hover:text-harbour-600">
                          {tech.name}
                        </span>
                      </div>
                      {tech.companyCount > 0 && (
                        <p className="text-xs text-harbour-400">
                          {tech.companyCount} {tech.companyCount === 1 ? "company" : "companies"}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
