import type { Route } from "./+types/about";
import { useLoaderData } from "react-router";
import { loadContentPage } from "~/lib/content.server";
import Markdown from "react-markdown";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `${data?.frontmatter?.title ?? "About"} - siliconharbour.dev` },
    {
      name: "description",
      content: data?.frontmatter?.description ?? "About siliconharbour.dev",
    },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const page = loadContentPage("about");
  return { frontmatter: page.frontmatter, content: page.content };
}

export default function AboutPage() {
  const { content } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="prose mx-auto">
        <Markdown>{content}</Markdown>
      </article>
    </div>
  );
}
