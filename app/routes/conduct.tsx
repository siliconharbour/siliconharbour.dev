import type { Route } from "./+types/conduct";
import { useLoaderData } from "react-router";
import { loadContentPage } from "~/lib/content.server";
import { Markdown } from "~/components/Markdown";
import { buildSeoMeta } from "~/lib/seo";

export function meta({ data }: Route.MetaArgs) {
  return buildSeoMeta({
    title: data?.frontmatter?.title ?? "Community Guidelines",
    description: data?.frontmatter?.description ?? "Community standards and guidelines for siliconharbour.dev.",
    url: "/conduct",
  });
}

export async function loader({}: Route.LoaderArgs) {
  const page = loadContentPage("conduct");
  return { frontmatter: page.frontmatter, content: page.content };
}

export default function ConductPage() {
  const { content } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-3xl mx-auto p-4 py-8">
      <article className="prose">
        <Markdown>{content}</Markdown>
      </article>
    </div>
  );
}
