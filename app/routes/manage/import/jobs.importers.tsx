import type { Route } from "./+types/jobs.importers";
import ImportersContent, { frontmatter } from "~/content/manage-import-job-importers.mdx";
import { requireAuth } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: `${frontmatter?.title ?? "Job Importers Overview"} - siliconharbour.dev` },
    {
      name: "description",
      content: frontmatter?.description ?? "Overview of job importers",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return null;
}

export default function ManageImportJobImportersPage() {
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        <article className="prose max-w-none">
          <ImportersContent />
        </article>
      </div>
    </div>
  );
}
