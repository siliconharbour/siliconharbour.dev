import type { Route } from "./+types/about";
import AboutContent, { frontmatter } from "~/content/about.mdx";
import { buildSeoMeta } from "~/lib/seo";

export function meta({}: Route.MetaArgs) {
  return buildSeoMeta({
    title: frontmatter?.title ?? "About siliconharbour.dev",
    description: frontmatter?.description ?? "About siliconharbour.dev — a community directory for the tech scene in St. John's, Newfoundland & Labrador.",
    url: "/about",
  });
}

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="prose mx-auto">
        <AboutContent />
      </article>
    </div>
  );
}
