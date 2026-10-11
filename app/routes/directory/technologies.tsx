import type { Route } from "./+types/technologies";
import { Link, useLoaderData } from "react-router";
import { getTechnologiesWithUsage, type TechnologyWithUsage } from "~/lib/technologies.server";
import { categoryLabels, technologyCategories } from "~/lib/technology-categories";
import { getOptionalUser } from "~/lib/session.server";
import { buildSeoMeta } from "~/lib/seo";

export function meta({}: Route.MetaArgs) {
  return buildSeoMeta({
    title: "Technologies at St. John's Tech Companies",
    description:
      "Programming languages, frameworks, and technologies used by tech companies in St. John's, Newfoundland & Labrador.",
    url: "/directory/technologies",
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const technologies = await getTechnologiesWithUsage();

  // Group by category and sort by company count (descending)
  const byCategory: Record<string, TechnologyWithUsage[]> = {};
  for (const tech of technologies) {
    if (!byCategory[tech.category]) {
      byCategory[tech.category] = [];
    }
    byCategory[tech.category].push(tech);
  }

  // Sort each category by company count
  for (const category of Object.keys(byCategory)) {
    byCategory[category].sort((a, b) => b.companyCount - a.companyCount);
  }

  return { byCategory, isAdmin };
}

export default function DirectoryTechnologies() {
  const { byCategory, isAdmin } = useLoaderData<typeof loader>();

  const totalCount = Object.values(byCategory).flat().length;

  return (
    <div className="flex flex-col gap-gap-6">
      {/* Admin create button */}
      {isAdmin && (
        <div className="flex justify-end">
          <Link
            to="/manage/technologies/new"
            className="px-pad-3 py-pad-1-5 text-sm bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            + New Technology
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-gap-2">
        <p className="text-muted">
          Technologies used by companies in the local tech ecosystem. Click on a technology to see
          which companies use it.
        </p>
        <p className="text-sm text-subtle">
          {totalCount} technologies tracked across {technologyCategories.length} categories
        </p>
      </div>

      {totalCount === 0 ? (
        <p className="text-subtle">No technologies listed yet.</p>
      ) : (
        <div className="flex flex-col gap-gap-8">
          {technologyCategories.map((category) => {
            const techs = byCategory[category];
            if (!techs || techs.length === 0) return null;

            return (
              <div key={category} className="flex flex-col gap-gap-4">
                <h2 className="text-lg font-semibold text-heading border-b border-line pb-pad-2">
                  {categoryLabels[category]}
                  <span className="ml-2 text-sm font-normal text-subtle">({techs.length})</span>
                </h2>
                {(() => {
                  const popularTechs = techs.filter((t) => t.companyCount > 1);
                  const singleTechs = techs.filter((t) => t.companyCount === 1);
                  return (
                    <>
                      {popularTechs.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-gap-3">
                          {popularTechs.map((tech) => (
                            <Link
                              key={tech.id}
                              to={`/directory/technologies/${tech.slug}`}
                              className="group flex flex-col gap-gap-2 p-pad-3 card-link"
                            >
                              <div className="flex items-center gap-gap-2">
                                {tech.icon ? (
                                  <img
                                    src={`/images/${tech.icon}`}
                                    alt=""
                                    className="w-6 h-6 object-contain"
                                  />
                                ) : (
                                  <div className="w-6 h-6 bg-tint flex items-center justify-center">
                                    <span className="text-xs text-subtle">
                                      {tech.name.charAt(0)}
                                    </span>
                                  </div>
                                )}
                                <span className="font-medium text-heading group-hover:text-body">
                                  {tech.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-gap-2">
                                {tech.companyLogos.length > 0 && (
                                  <div className="flex gap-gap-1">
                                    {tech.companyLogos.map((logo, i) => (
                                      <img
                                        key={i}
                                        src={`/images/${logo}`}
                                        alt=""
                                        className="w-5 h-5 p-px object-contain ring-1 ring-harbour-100 bg-surface"
                                      />
                                    ))}
                                  </div>
                                )}
                                <p className="text-xs text-subtle">{tech.companyCount} companies</p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                      {singleTechs.length > 0 && (
                        <div className="flex flex-wrap gap-gap-1-5 items-center">
                          {singleTechs.map((tech) => (
                            <Link
                              key={tech.id}
                              to={`/directory/technologies/${tech.slug}`}
                              className="group flex items-center gap-gap-1 px-pad-2 py-pad-1 text-xs card-link"
                            >
                              {tech.icon ? (
                                <img
                                  src={`/images/${tech.icon}`}
                                  alt=""
                                  className="w-3.5 h-3.5 object-contain"
                                />
                              ) : (
                                <div className="w-3.5 h-3.5 bg-tint flex items-center justify-center">
                                  <span className="text-[8px] text-subtle">
                                    {tech.name.charAt(0)}
                                  </span>
                                </div>
                              )}
                              <span className="text-body group-hover:text-heading">
                                {tech.name}
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
