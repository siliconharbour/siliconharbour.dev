import type { Route } from "./+types/about";
import AboutContent, { frontmatter } from "~/content/about.mdx";

export function meta({}: Route.MetaArgs) {
  return [
    { title: `${frontmatter?.title ?? "About"} - siliconharbour.dev` },
    {
      name: "description",
      content: frontmatter?.description ?? "About siliconharbour.dev",
    },
  ];
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
