import type { Route } from "./+types/news-rss";
import { getPublishedNews } from "~/lib/news.server";
import { format } from "date-fns";

export async function loader({}: Route.LoaderArgs) {
  const articles = await getPublishedNews();

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>News - siliconharbour.dev</title>
    <link>https://siliconharbour.dev/news</link>
    <description>News and announcements from the St. John's tech community</description>
    <language>en-ca</language>
    <lastBuildDate>${format(new Date(), "EEE, dd MMM yyyy HH:mm:ss xx")}</lastBuildDate>
    <atom:link href="https://siliconharbour.dev/news.rss" rel="self" type="application/rss+xml"/>
${articles
  .map(
    (article) => `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>https://siliconharbour.dev/news/${article.slug}</link>
      <description>${escapeXml(article.excerpt ?? article.content.slice(0, 500))}${!article.excerpt && article.content.length > 500 ? "..." : ""}</description>
      <pubDate>${format(article.publishedAt ?? article.createdAt, "EEE, dd MMM yyyy HH:mm:ss xx")}</pubDate>
      <guid isPermaLink="false">news-${article.id}</guid>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
