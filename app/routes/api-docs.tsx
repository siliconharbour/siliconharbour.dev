import type { Route } from "./+types/api-docs";
import ApiDocsContent, { frontmatter } from "~/content/api-docs.mdx";

export function meta({}: Route.MetaArgs) {
  return [
    { title: `${frontmatter?.title ?? "API"} - siliconharbour.dev` },
    {
      name: "description",
      content: frontmatter?.description ?? "Public JSON API for siliconharbour.dev",
    },
  ];
}

export default function ApiDocsPage() {
  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="prose">
        <ApiDocsContent />
      </article>
    </div>
  );
}
