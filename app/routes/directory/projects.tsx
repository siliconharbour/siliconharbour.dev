import type { Route } from "./+types/projects";
import { Link, useLoaderData } from "react-router";
import { getPaginatedProjects } from "~/lib/projects.server";
import { getOptionalUser } from "~/lib/session.server";
import { parseProjectLinks } from "~/lib/project-links";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";
import type { ProjectType, ProjectStatus } from "~/db/schema";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Projects - Directory - siliconharbour.dev" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";
  
  const { items, total } = await getPaginatedProjects(limit, offset, searchQuery);
  return { items, total, limit, offset, searchQuery, isAdmin };
}

const typeLabels: Record<ProjectType, string> = {
  game: "Game",
  webapp: "Web App",
  library: "Library",
  tool: "Tool",
  hardware: "Hardware",
  other: "Project",
};

const statusColors: Record<ProjectStatus, string> = {
  active: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  archived: "bg-harbour-100 text-harbour-500",
  "on-hold": "bg-amber-100 text-amber-700",
};

export default function DirectoryProjects() {
  const { items, total, limit, offset, searchQuery, isAdmin } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-6">
      {isAdmin && (
        <div className="flex justify-end">
          <Link
            to="/manage/projects/new"
            className="px-3 py-1.5 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
          >
            + New Project
          </Link>
        </div>
      )}

      {/* Search */}
      {(total > limit || searchQuery) && (
        <div className="flex flex-col gap-2">
          <SearchInput placeholder="Search projects..." />
          {searchQuery && (
            <p className="text-sm text-harbour-500">
              {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-harbour-400">
          {searchQuery ? "No projects match your search." : "No projects listed yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((project) => {
            const links = parseProjectLinks(project.links);
            return (
              <a
                key={project.id}
                href={`/directory/projects/${project.slug}`}
                className="group flex flex-col ring-1 ring-harbour-200/50 hover:ring-harbour-300 focus:ring-harbour-400 transition-all overflow-hidden"
              >
                {project.coverImage ? (
                  <div className="img-tint aspect-video relative overflow-hidden bg-harbour-100">
                    <img
                      src={`/images/${project.coverImage}`}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                ) : project.logo ? (
                  <div className="aspect-video relative overflow-hidden bg-harbour-50 flex items-center justify-center">
                    <div className="img-tint w-20 h-20 relative overflow-hidden">
                      <img
                        src={`/images/${project.logo}`}
                        alt=""
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video bg-harbour-100" />
                )}
                
                <div className="p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
                      {project.name}
                    </h2>
                    <span className={`text-xs px-1.5 py-0.5 ${statusColors[project.status]}`}>
                      {project.status}
                    </span>
                  </div>
                  
                  <p className="text-xs text-harbour-400">
                    {typeLabels[project.type]}
                  </p>
                  
                  {/* Quick link icons */}
                  <div className="flex items-center gap-2 mt-1">
                    {links.github && (
                      <span className="text-harbour-400" title="GitHub">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                      </span>
                    )}
                    {links.itchio && (
                      <span className="text-harbour-400" title="itch.io">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3.13 1.338C2.08 1.96.02 4.328 0 4.95v1.03c0 1.303 1.22 2.45 2.325 2.45 1.33 0 2.436-1.102 2.436-2.41 0 1.308 1.07 2.41 2.4 2.41 1.328 0 2.362-1.102 2.362-2.41 0 1.308 1.137 2.41 2.466 2.41h.024c1.33 0 2.466-1.102 2.466-2.41 0 1.308 1.034 2.41 2.363 2.41 1.33 0 2.4-1.102 2.4-2.41 0 1.308 1.106 2.41 2.435 2.41C22.78 8.43 24 7.283 24 5.98V4.95c-.02-.62-2.08-2.99-3.13-3.612-3.253-.114-5.508-.134-8.87-.134-3.362 0-5.617.02-8.87.134zm6.59 6.71c-.193.4-.48.726-.834.972-.378.27-.762.436-1.19.536v9.12l4.307 4.986 4.308-4.986v-9.12c-.428-.1-.812-.267-1.19-.536-.354-.246-.64-.573-.834-.972-.185.373-.448.69-.778.93-.443.32-.973.49-1.513.49h-.012c-.54 0-1.07-.17-1.513-.49-.33-.24-.593-.557-.778-.93z"/>
                        </svg>
                      </span>
                    )}
                    {links.website && (
                      <span className="text-harbour-400" title="Website">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
      
      <Pagination total={total} limit={limit} offset={offset} />
    </div>
  );
}
