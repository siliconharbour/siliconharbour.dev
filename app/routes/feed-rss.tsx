import type { Route } from "./+types/feed-rss";
import { getUpcomingEvents } from "~/lib/events.server";
import { getPublishedNews } from "~/lib/news.server";
import { getActiveJobs } from "~/lib/jobs.server";
import { format } from "date-fns";
import { formatInTimezone } from "~/lib/timezone";

export async function loader({}: Route.LoaderArgs) {
  const [events, newsArticles, jobs] = await Promise.all([
    getUpcomingEvents(),
    getPublishedNews(),
    getActiveJobs({ includeNonTechnical: true }),
  ]);
  const newsCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentNews = newsArticles.filter((article) => {
    const date = article.publishedAt ?? article.createdAt;
    return date >= newsCutoff;
  });

  // Combine all items with a common format
  type FeedItem = {
    title: string;
    link: string;
    description: string;
    pubDate: Date;
    guid: string;
    category: string;
  };

  const items: FeedItem[] = [
    ...events.map((event) => {
      const nextDate = event.dates[0];
      const dateStr = nextDate ? formatInTimezone(nextDate.startDate, "MMM d, yyyy") : "";
      return {
        title: `Event - ${event.title}${dateStr ? ` - ${dateStr}` : ""}`,
        link: `https://siliconharbour.dev/events/${event.slug}`,
        description:
          event.description.slice(0, 500) + (event.description.length > 500 ? "..." : ""),
        pubDate: event.createdAt,
        guid: `event-${event.id}`,
        category: "Events",
      };
    }),
    ...recentNews.map((article) => ({
      title: `News - ${article.title}`,
      link: `https://siliconharbour.dev/news/${article.slug}`,
      description:
        article.excerpt ??
        article.content.slice(0, 500) + (article.content.length > 500 ? "..." : ""),
      pubDate: article.publishedAt ?? article.createdAt,
      guid: `news-${article.id}`,
      category: "News",
    })),
    ...jobs.map((job) => {
        const description = job.description || job.descriptionText || "";
        return {
          title: `Job - ${job.title}${job.companyName ? ` at ${job.companyName}` : ""}`,
          link: job.slug
            ? `https://siliconharbour.dev/jobs/${job.slug}`
            : job.url || "https://siliconharbour.dev/jobs",
          description: description.slice(0, 500) + (description.length > 500 ? "..." : ""),
          pubDate: job.postedAt || job.createdAt,
          guid: `job-${job.id}`,
          category: "Jobs",
        };
      }),
  ];

  // Sort by date, most recent first
  items.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

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
    <title>siliconharbour.dev</title>
    <link>https://siliconharbour.dev</link>
    <description>Events, news, and jobs from the St. John's tech community</description>
    <language>en-ca</language>
    <lastBuildDate>${format(new Date(), "EEE, dd MMM yyyy HH:mm:ss xx")}</lastBuildDate>
    <atom:link href="https://siliconharbour.dev/feed.rss" rel="self" type="application/rss+xml"/>
${items
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${item.link}</link>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${format(item.pubDate, "EEE, dd MMM yyyy HH:mm:ss xx")}</pubDate>
      <guid isPermaLink="false">${item.guid}</guid>
      <category>${item.category}</category>
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
