import type { Route } from "./+types/sitemap-xml";
import { getSitemapEntries } from "~/lib/sitemap.server";

export async function loader({ request }: Route.LoaderArgs) {
  const siteUrl = process.env.SITE_URL || "https://siliconharbour.dev";
  const entries = await getSitemapEntries(siteUrl);

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...entries.map((entry) =>
      [
        `  <url>`,
        `    <loc>${entry.url}</loc>`,
        entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : "",
        `  </url>`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    `</urlset>`,
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
