import type { Route } from "./+types/jobs-rss";
import { getActiveJobs } from "~/lib/jobs.server";
import { format } from "date-fns";

export async function loader({}: Route.LoaderArgs) {
  const jobs = await getActiveJobs();

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
    <title>Jobs - siliconharbour.dev</title>
    <link>https://siliconharbour.dev/jobs</link>
    <description>Tech job opportunities in the St. John's community</description>
    <language>en-ca</language>
    <lastBuildDate>${format(new Date(), "EEE, dd MMM yyyy HH:mm:ss xx")}</lastBuildDate>
    <atom:link href="https://siliconharbour.dev/jobs.rss" rel="self" type="application/rss+xml"/>
${jobs
  .map(
    (job) => `    <item>
      <title>${escapeXml(job.title)}${job.companyName ? ` at ${escapeXml(job.companyName)}` : ""}</title>
      <link>https://siliconharbour.dev/jobs/${job.slug}</link>
      <description>${escapeXml(job.description.slice(0, 500))}${job.description.length > 500 ? "..." : ""}</description>
      <pubDate>${format(job.postedAt, "EEE, dd MMM yyyy HH:mm:ss xx")}</pubDate>
      <guid isPermaLink="false">job-${job.id}</guid>
    </item>`
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
