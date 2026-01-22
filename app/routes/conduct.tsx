import type { Route } from "./+types/conduct";
import { useLoaderData } from "react-router";
import { loadContentPage } from "~/lib/content.server";
import Markdown from "react-markdown";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `${data?.frontmatter?.title ?? "Community Guidelines"} - siliconharbour.dev` },
    {
      name: "description",
      content: data?.frontmatter?.description ?? "Community guidelines for siliconharbour.dev",
    },
  ];
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
