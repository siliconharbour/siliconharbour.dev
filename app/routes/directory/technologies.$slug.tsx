import type { Route } from "./+types/technologies.$slug";
import { Link, useLoaderData } from "react-router";
import {
  getTechnologyBySlug,
  getCompaniesUsingTechnology,
  getProjectsUsingTechnology,
} from "~/lib/technologies.server";
import { categoryLabels } from "~/lib/technology-categories";
import { getOptionalUser } from "~/lib/session.server";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.technology?.name ?? "Technology"} - siliconharbour.dev` }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const technology = await getTechnologyBySlug(params.slug);
  if (!technology) {
    throw new Response("Technology not found", { status: 404 });
  }

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const [companies, projects] = await Promise.all([
    getCompaniesUsingTechnology(technology.id),
    getProjectsUsingTechnology(technology.id),
  ]);

  return { technology, companies, projects, isAdmin };
}

export default function TechnologyDetail() {
  const { technology, companies, projects, isAdmin } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        {technology.icon ? (
          <img
            src={`/images/${technology.icon}`}
            alt=""
            className="w-16 h-16 object-contain"
          />
        ) : (
          <div className="w-16 h-16 bg-harbour-100 flex items-center justify-center">
            <span className="text-2xl text-harbour-400">{technology.name.charAt(0)}</span>
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-harbour-800">{technology.name}</h1>
            {isAdmin && (
              <Link
                to={`/manage/technologies/${technology.id}`}
                className="text-sm text-harbour-400 hover:text-harbour-600"
              >
                Edit
              </Link>
            )}
          </div>
          <p className="text-harbour-500">{categoryLabels[technology.category]}</p>
          {technology.website && (
            <a
              href={technology.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-harbour-600 hover:underline"
            >
              Official Website →
            </a>
          )}
        </div>
      </div>

      {/* Description */}
      {technology.description && (
        <p className="text-harbour-600">{technology.description}</p>
      )}

      {/* Companies using this technology */}
      {companies.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">
            Companies using {technology.name}
            <span className="ml-2 text-sm font-normal text-harbour-400">({companies.length})</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {companies.map((company) => (
              <Link
                key={company.id}
                to={`/directory/companies/${company.slug}`}
                className="group flex flex-col items-center gap-2 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 focus:ring-harbour-400 transition-all"
              >
                {company.logo ? (
                  <img
                    src={`/images/${company.logo}`}
                    alt=""
                    className="w-12 h-12 object-contain"
                  />
                ) : (
                  <div className="w-12 h-12 bg-harbour-100 flex items-center justify-center">
                    <span className="text-lg text-harbour-400">{company.name.charAt(0)}</span>
                  </div>
                )}
                <span className="text-sm text-centre text-harbour-700 group-hover:text-harbour-600 text-center">
                  {company.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Projects using this technology */}
      {projects.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">
            Projects using {technology.name}
            <span className="ml-2 text-sm font-normal text-harbour-400">({projects.length})</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/directory/projects/${project.slug}`}
                className="group flex flex-col items-center gap-2 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 focus:ring-harbour-400 transition-all"
              >
                {project.logo ? (
                  <img
                    src={`/images/${project.logo}`}
                    alt=""
                    className="w-12 h-12 object-contain"
                  />
                ) : (
                  <div className="w-12 h-12 bg-harbour-100 flex items-center justify-center">
                    <span className="text-lg text-harbour-400">{project.name.charAt(0)}</span>
                  </div>
                )}
                <span className="text-sm text-harbour-700 group-hover:text-harbour-600 text-center">
                  {project.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* No usage */}
      {companies.length === 0 && projects.length === 0 && (
        <p className="text-harbour-400">
          No companies or projects are currently using {technology.name}.
        </p>
      )}

      {/* Back link */}
      <div className="pt-4 border-t border-harbour-200">
        <Link to="/directory/technologies" className="text-harbour-500 hover:text-harbour-700">
          ← Back to Technologies
        </Link>
      </div>
    </div>
  );
}
