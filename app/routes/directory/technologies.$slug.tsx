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
    <div className="max-w-4xl mx-auto p-pad-4 py-pad-8 flex flex-col gap-gap-8">
      {/* Header */}
      <div className="flex items-start gap-gap-4">
        {technology.icon ? (
          <img src={`/images/${technology.icon}`} alt="" className="w-16 h-16 object-contain" />
        ) : (
          <div className="w-16 h-16 bg-tint flex items-center justify-center">
            <span className="text-2xl text-subtle">{technology.name.charAt(0)}</span>
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-gap-3">
            <h1 className="text-2xl font-bold text-harbour-800">{technology.name}</h1>
            {isAdmin && (
              <Link
                to={`/manage/technologies/${technology.id}`}
                className="text-sm text-subtle hover:text-body"
              >
                Edit
              </Link>
            )}
          </div>
          <p className="text-muted">{categoryLabels[technology.category]}</p>
          {technology.website && (
            <a
              href={technology.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-body hover:underline"
            >
              Official Website →
            </a>
          )}
        </div>
      </div>

      {/* Description */}
      {technology.description && <p className="text-body">{technology.description}</p>}

      {/* Companies using this technology */}
      {companies.length > 0 && (
        <div className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">
            Companies using {technology.name}
            <span className="ml-2 text-sm font-normal text-subtle">({companies.length})</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-gap-4">
            {companies.map((company) => (
              <Link
                key={company.id}
                to={`/directory/companies/${company.slug}`}
                className="group flex flex-col items-center gap-gap-2 p-pad-4 card-link"
              >
                {company.logo ? (
                  <img
                    src={`/images/${company.logo}`}
                    alt=""
                    className="w-12 h-12 object-contain"
                  />
                ) : (
                  <div className="w-12 h-12 bg-tint flex items-center justify-center">
                    <span className="text-lg text-subtle">{company.name.charAt(0)}</span>
                  </div>
                )}
                <span className="text-sm text-centre text-heading group-hover:text-body text-center">
                  {company.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Projects using this technology */}
      {projects.length > 0 && (
        <div className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">
            Projects using {technology.name}
            <span className="ml-2 text-sm font-normal text-subtle">({projects.length})</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/directory/projects/${project.slug}`}
                className="group flex flex-col items-center gap-gap-2 p-pad-4 card-link"
              >
                {project.logo ? (
                  <img
                    src={`/images/${project.logo}`}
                    alt=""
                    className="w-12 h-12 object-contain"
                  />
                ) : (
                  <div className="w-12 h-12 bg-tint flex items-center justify-center">
                    <span className="text-lg text-subtle">{project.name.charAt(0)}</span>
                  </div>
                )}
                <span className="text-sm text-heading group-hover:text-body text-center">
                  {project.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* No usage */}
      {companies.length === 0 && projects.length === 0 && (
        <p className="text-subtle">
          No companies or projects are currently using {technology.name}.
        </p>
      )}

      {/* Back link */}
      <div className="pt-pad-4 border-t border-line">
        <Link to="/directory/technologies" className="text-muted hover:text-heading">
          ← Back to Technologies
        </Link>
      </div>
    </div>
  );
}
