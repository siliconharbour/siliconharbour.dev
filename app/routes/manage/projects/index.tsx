import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getPaginatedProjects } from "~/lib/projects.server";
import { SearchInput } from "~/components/SearchInput";
import type { ProjectStatus, ProjectType } from "~/db/schema";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Projects - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const { items: projects } = await getPaginatedProjects(100, 0, searchQuery);
  return { projects, searchQuery };
}

const typeLabels: Record<ProjectType, string> = {
  game: "Game",
  webapp: "Web App",
  library: "Library",
  tool: "Tool",
  hardware: "Hardware",
  other: "Other",
};

const statusColors: Record<ProjectStatus, string> = {
  active: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  archived: "bg-tint text-muted",
  "on-hold": "bg-amber-100 text-amber-700",
};

export default function ManageProjectsIndex() {
  const { projects } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-heading">Projects</h1>
          <Link
            to="/manage/projects/new"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
          >
            New Project
          </Link>
        </div>

        <SearchInput placeholder="Search projects..." />

        {projects.length === 0 ? (
          <div className="text-center p-pad-12 text-subtle">
            No projects yet. Create your first project to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex items-center gap-gap-4 p-pad-4 bg-surface border border-line rounded-panel"
              >
                {project.logo ? (
                  <img
                    src={`/images/${project.logo}`}
                    alt=""
                    className="w-12 h-12 object-contain"
                  />
                ) : project.coverImage ? (
                  <img
                    src={`/images/${project.coverImage}`}
                    alt=""
                    className="w-12 h-12 object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 bg-tint" />
                )}

                <div className="flex-1 min-w-0 flex flex-col gap-gap-0-5">
                  <div className="flex items-center gap-gap-2">
                    <h2 className="font-medium truncate text-heading">{project.name}</h2>
                    <span
                      className={`text-xs px-pad-1-5 py-pad-0-5 ${statusColors[project.status]}`}
                    >
                      {project.status}
                    </span>
                  </div>
                  <p className="text-sm text-subtle">{typeLabels[project.type]}</p>
                </div>

                <div className="flex items-center gap-gap-2">
                  <Link
                    to={`/manage/projects/${project.id}`}
                    className="px-pad-3 py-pad-1-5 text-sm font-medium text-body hover:bg-soft transition-colors"
                  >
                    Edit
                  </Link>
                  <Link
                    to={`/manage/projects/${project.id}/delete`}
                    className="px-pad-3 py-pad-1-5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </Link>
                </div>
              </div>
            ))}
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
