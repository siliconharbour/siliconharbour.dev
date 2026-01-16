import type { Route } from "./+types/detail";
import { useLoaderData } from "react-router";
import { getProjectBySlugWithImages } from "~/lib/projects.server";
import { parseProjectLinks } from "~/lib/project-links";
import { prepareRefsForClient, getRichIncomingReferences } from "~/lib/references.server";
import { getPublicComments, getAllComments } from "~/lib/comments.server";
import { getTurnstileSiteKey } from "~/lib/turnstile.server";
import { getOptionalUser } from "~/lib/session.server";
import { PublicLayout } from "~/components/PublicLayout";
import { RichMarkdown } from "~/components/RichMarkdown";
import { CommentSection } from "~/components/CommentSection";
import { ImageGallery } from "~/components/ImageGallery";
import type { ProjectType, ProjectStatus } from "~/db/schema";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `${data?.project?.name ?? "Project"} - siliconharbour.dev` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const project = await getProjectBySlugWithImages(params.slug);
  if (!project) {
    throw new Response("Project not found", { status: 404 });
  }
  
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";
  
  const [resolvedRefs, backlinks, comments] = await Promise.all([
    prepareRefsForClient(project.description),
    getRichIncomingReferences("project", project.id),
    isAdmin ? getAllComments("project", project.id) : getPublicComments("project", project.id),
  ]);
  
  const turnstileSiteKey = getTurnstileSiteKey();
  
  return { project, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin };
}

const typeLabels: Record<ProjectType, string> = {
  game: "Game",
  webapp: "Web App",
  library: "Library",
  tool: "Tool",
  hardware: "Hardware",
  other: "Project",
};

const statusLabels: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
  "on-hold": "On Hold",
};

const statusColors: Record<ProjectStatus, string> = {
  active: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  archived: "bg-harbour-100 text-harbour-500",
  "on-hold": "bg-amber-100 text-amber-700",
};

// Link display configuration
const linkConfig: Record<string, { label: string; icon: React.ReactNode }> = {
  github: {
    label: "GitHub",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    ),
  },
  itchio: {
    label: "itch.io",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3.13 1.338C2.08 1.96.02 4.328 0 4.95v1.03c0 1.303 1.22 2.45 2.325 2.45 1.33 0 2.436-1.102 2.436-2.41 0 1.308 1.07 2.41 2.4 2.41 1.328 0 2.362-1.102 2.362-2.41 0 1.308 1.137 2.41 2.466 2.41h.024c1.33 0 2.466-1.102 2.466-2.41 0 1.308 1.034 2.41 2.363 2.41 1.33 0 2.4-1.102 2.4-2.41 0 1.308 1.106 2.41 2.435 2.41C22.78 8.43 24 7.283 24 5.98V4.95c-.02-.62-2.08-2.99-3.13-3.612-3.253-.114-5.508-.134-8.87-.134-3.362 0-5.617.02-8.87.134z"/>
      </svg>
    ),
  },
  website: {
    label: "Website",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
  demo: {
    label: "Live Demo",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  npm: {
    label: "npm",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331z"/>
      </svg>
    ),
  },
  pypi: {
    label: "PyPI",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0L1.605 6v12L12 24l10.395-6V6L12 0zm-.53 2.08l7.82 4.517-2.557 1.477-7.82-4.517L11.47 2.08zM7.91 5.17l7.82 4.517-2.557 1.477-7.82-4.517L7.91 5.17zM4.35 7.68l7.82 4.517v5.09l-7.82-4.517V7.68zm8.85 9.607v-5.09l7.82-4.517v5.09l-7.82 4.517z"/>
      </svg>
    ),
  },
  steam: {
    label: "Steam",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0z"/>
      </svg>
    ),
  },
  appstore: {
    label: "App Store",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
    ),
  },
  playstore: {
    label: "Google Play",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 9.99l-2.302 2.302-8.634-8.634z"/>
      </svg>
    ),
  },
};

export default function ProjectDetail() {
  const { project, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin } = useLoaderData<typeof loader>();
  const links = parseProjectLinks(project.links);
  const linkEntries = Object.entries(links).filter(([_, url]) => url);

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto p-4 py-8">
        <article className="flex flex-col gap-6">
          {project.coverImage && (
            <div className="img-tint aspect-video relative overflow-hidden bg-harbour-100">
              <img
                src={`/images/${project.coverImage}`}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex items-start gap-4">
            {project.logo && (
              <div className="img-tint w-20 h-20 relative overflow-hidden bg-harbour-100 flex-shrink-0">
                <img
                  src={`/images/${project.logo}`}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <h1 className="text-3xl font-bold text-harbour-700">{project.name}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-harbour-500">{typeLabels[project.type]}</span>
                <span className={`text-xs px-1.5 py-0.5 ${statusColors[project.status]}`}>
                  {statusLabels[project.status]}
                </span>
              </div>
            </div>
          </div>

          <RichMarkdown content={project.description} resolvedRefs={resolvedRefs} />

          {/* Image Gallery */}
          {project.images.length > 0 && (
            <ImageGallery images={project.images} />
          )}

          {/* Links */}
          {linkEntries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {linkEntries.map(([key, url]) => {
                const config = linkConfig[key] || { 
                  label: key.charAt(0).toUpperCase() + key.slice(1),
                  icon: (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  ),
                };
                return (
                  <a
                    key={key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-harbour-100 text-harbour-700 hover:bg-harbour-200 transition-colors no-underline"
                  >
                    {config.icon}
                    {config.label}
                  </a>
                );
              })}
            </div>
          )}

          {backlinks.length > 0 && (
            <div className="border-t border-harbour-200/50 pt-6">
              <h2 className="text-lg font-semibold text-harbour-700 mb-3">Referenced By</h2>
              <ul className="flex flex-col gap-2">
                {backlinks.map((link) => (
                  <li key={`${link.type}-${link.id}`}>
                    <a href={link.url} className="text-harbour-600 hover:text-harbour-700">
                      {link.name}
                    </a>
                    <span className="text-harbour-400 text-sm ml-2">({link.type})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CommentSection
            contentType="project"
            contentId={project.id}
            comments={comments}
            turnstileSiteKey={turnstileSiteKey}
            isAdmin={isAdmin}
          />
        </article>
      </div>
    </PublicLayout>
  );
}
