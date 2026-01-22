import type { Route } from "./+types/api-docs";
import { useLoaderData } from "react-router";
import { loadContentPage } from "~/lib/content.server";
import Markdown from "react-markdown";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `${data?.frontmatter?.title ?? "API"} - siliconharbour.dev` },
    {
      name: "description",
      content: data?.frontmatter?.description ?? "Public JSON API for siliconharbour.dev",
    },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const page = loadContentPage("api-docs");
  return { frontmatter: page.frontmatter, content: page.content };
}

export default function ApiDocsPage() {
  const { content } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="prose">
        <Markdown>{content}</Markdown>
      </article>
    </div>
  );
}
