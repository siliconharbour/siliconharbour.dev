import type { Route } from "./+types/api-docs";
import ApiDocsContent, { frontmatter } from "~/content/api-docs.mdx";
import { buildSeoMeta } from "~/lib/seo";
import { getHostFunctionDocs } from "~/mcp/bridge";

export function meta({}: Route.MetaArgs) {
  return buildSeoMeta({
    title: frontmatter?.title ?? "API",
    description:
      frontmatter?.description ??
      "Public JSON API for accessing St. John's tech community data — events, jobs, companies, groups, and more.",
    url: "/api",
  });
}

export async function loader(_args: Route.LoaderArgs) {
  // Snapshot the live MCP host-function metadata so the docs page can
  // render an auto-generated tool listing. Sourced straight from the
  // host() wrappers in app/mcp/bridge.ts.
  return {
    mcpDocs: getHostFunctionDocs(),
  };
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
