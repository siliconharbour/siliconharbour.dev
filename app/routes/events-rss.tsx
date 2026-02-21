import type { Route } from "./+types/events-rss";
import { getUpcomingEvents } from "~/lib/events.server";
import { formatInTimezone } from "~/lib/timezone";

export async function loader({}: Route.LoaderArgs) {
  const events = await getUpcomingEvents();

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
    <title>Events - siliconharbour.dev</title>
    <link>https://siliconharbour.dev/events</link>
    <description>Tech events in the St. John's community</description>
    <language>en-ca</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <ttl>60</ttl>
    <atom:link href="https://siliconharbour.dev/events.rss" rel="self" type="application/rss+xml"/>
${events
  .map((event) => {
    const nextDate = event.dates[0];
    const dateStr = nextDate ? formatInTimezone(nextDate.startDate, "MMM d, yyyy") : "";
    const title = `${event.title}${dateStr ? ` - ${dateStr}` : ""}`;
    return `    <item>
      <title>${escapeXml(title)}</title>
      <link>https://siliconharbour.dev/events/${event.slug}</link>
      <description>${escapeXml(event.description.slice(0, 500))}${event.description.length > 500 ? "..." : ""}</description>
      <pubDate>${event.createdAt.toUTCString()}</pubDate>
      <guid isPermaLink="false">event-${event.id}</guid>
      <category>Events</category>${event.organizer ? `\n      <author>events@siliconharbour.dev (${escapeXml(event.organizer)})</author>` : ""}
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
