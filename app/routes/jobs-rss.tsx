import type { Route } from "./+types/jobs-rss";
import { db } from "~/db";
import { jobs, companies } from "~/db/schema";
import { eq, desc } from "drizzle-orm";
import { format } from "date-fns";

export async function loader({}: Route.LoaderArgs) {
  const data = await db
    .select({
      job: jobs,
      companyName: companies.name,
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.status, "active"))
    .orderBy(desc(jobs.postedAt))
    .limit(50);

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
${data
  .map(({ job, companyName }) => {
    const description = job.description || job.descriptionText || "";
    const pubDate = job.postedAt || job.createdAt;
    const link = job.slug
      ? `https://siliconharbour.dev/jobs/${job.slug}`
      : job.url || "https://siliconharbour.dev/jobs";
    return `    <item>
      <title>${escapeXml(job.title)}${companyName ? ` at ${escapeXml(companyName)}` : ""}</title>
      <link>${link}</link>
      <description>${escapeXml(description.slice(0, 500))}${description.length > 500 ? "..." : ""}</description>
      <pubDate>${format(pubDate, "EEE, dd MMM yyyy HH:mm:ss xx")}</pubDate>
      <guid isPermaLink="false">job-${job.id}</guid>
    </item>`;
  })
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
