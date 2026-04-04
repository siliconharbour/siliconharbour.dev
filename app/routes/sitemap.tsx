import type { Route } from "./+types/sitemap";
import { useLoaderData } from "react-router";
import { getSitemapEntries } from "~/lib/sitemap.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Sitemap - siliconharbour.dev" },
    { name: "description", content: "All pages on siliconharbour.dev" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const siteUrl = process.env.SITE_URL || "https://siliconharbour.dev";
  const entries = await getSitemapEntries(siteUrl);

  // Group by section
  const sections = entries.reduce<Record<string, typeof entries>>(
    (acc, entry) => {
      if (!acc[entry.section]) acc[entry.section] = [];
      acc[entry.section].push(entry);
      return acc;
    },
    {},
  );

  return { sections, total: entries.length };
}

export default function SitemapPage() {
  const { sections, total } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold text-harbour-700 mb-1">Sitemap</h1>
          <p className="text-sm text-harbour-400">
            {total} URLs &middot;{" "}
            <a href="/sitemap.xml" className="underline hover:text-harbour-600">
              sitemap.xml
            </a>
          </p>
        </div>

        {Object.entries(sections).map(([section, entries]) => (
          <section key={section}>
            <h2 className="text-sm font-semibold text-harbour-500 uppercase tracking-wide mb-3 pb-2 border-b border-harbour-100">
              {section}
              <span className="ml-2 font-normal text-harbour-400 normal-case tracking-normal">
                ({entries.length})
              </span>
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {entries.map((entry) => (
                <li key={entry.url}>
                  <a
                    href={entry.url}
                    className="flex items-baseline justify-between group py-1 px-2 hover:bg-harbour-50"
                  >
                    <span className="text-sm text-harbour-600 group-hover:text-harbour-800 truncate">
                      {entry.url.replace(/^https?:\/\/[^/]+/, "")}
                    </span>
                    {entry.lastmod && (
                      <span className="text-xs text-harbour-300 shrink-0 ml-3">
                        {entry.lastmod}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
