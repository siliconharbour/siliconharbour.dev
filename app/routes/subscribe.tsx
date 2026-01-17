import type { Route } from "./+types/subscribe";
import { useState } from "react";
import { useLoaderData } from "react-router";
import { getUpcomingEvents } from "~/lib/events.server";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Stay Connected - siliconharbour.dev" },
    { name: "description", content: "Subscribe to the St. John's tech community calendar, RSS feeds, and more." },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const siteUrl = process.env.SITE_URL || "https://siliconharbour.dev";
  const calendarUrl = `${siteUrl}/calendar.ics`;
  const events = await getUpcomingEvents();
  
  const feeds = [
    {
      name: "All Updates",
      url: `${siteUrl}/feed.rss`,
      description: "Everything from siliconharbour.dev - events, news, jobs, and more.",
    },
    {
      name: "Events",
      url: `${siteUrl}/events.rss`,
      description: "Upcoming tech events, meetups, and conferences in St. John's.",
    },
    {
      name: "News",
      url: `${siteUrl}/news.rss`,
      description: "Latest news and updates from the local tech community.",
    },
    {
      name: "Jobs",
      url: `${siteUrl}/jobs.rss`,
      description: "Job postings from tech companies in Newfoundland.",
    },
  ];
  
  return { calendarUrl, events: events.slice(0, 3), feeds };
}

export default function SubscribePage() {
  const { calendarUrl, events, feeds } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-3xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-bold text-harbour-700 mb-2">Stay Connected</h1>
          <p className="text-harbour-500">
            Keep up with the St. John's tech community through calendar subscriptions, RSS feeds, and more.
          </p>
        </div>

        {/* Calendar Section */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-harbour-700">Calendar</h2>
            <p className="text-sm text-harbour-500 mt-1">
              Subscribe to our calendar to automatically sync local tech events to your calendar app.
            </p>
          </div>
          
          <CopyUrlCard url={calendarUrl} label="Calendar URL" />
          
          {/* Upcoming events preview */}
          {events.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-harbour-500">Upcoming events:</p>
              <div className="flex flex-col gap-2">
                {events.map((event) => {
                  const nextDate = event.dates[0];
                  if (!nextDate) return null;
                  return (
                    <a
                      key={event.id}
                      href={`/events/${event.slug}`}
                      className="group flex items-center gap-3 p-2 text-sm ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
                    >
                      <span className="text-harbour-500 tabular-nums">
                        {format(nextDate.startDate, "MMM d")}
                      </span>
                      <span className="link-title text-harbour-700">{event.title}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
          
          <details open className="group">
            <summary className="cursor-pointer text-sm font-medium text-harbour-600 hover:text-harbour-700 list-none flex items-center gap-1">
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              How to subscribe
            </summary>
            <div className="mt-4 pl-5 flex flex-col gap-4 text-sm text-harbour-600">
              <div>
                <h4 className="font-medium text-harbour-700 mb-1">Google Calendar</h4>
                <ol className="list-decimal list-inside space-y-0.5 text-harbour-500">
                  <li>Copy the calendar URL above</li>
                  <li>Open Google Calendar, click + next to "Other calendars"</li>
                  <li>Select "From URL", paste the URL, click "Add calendar"</li>
                </ol>
              </div>
              <div>
                <h4 className="font-medium text-harbour-700 mb-1">Apple Calendar</h4>
                <ol className="list-decimal list-inside space-y-0.5 text-harbour-500">
                  <li>Copy the calendar URL above</li>
                  <li>In Calendar app: File &rarr; New Calendar Subscription</li>
                  <li>Paste the URL and click Subscribe</li>
                </ol>
              </div>
              <div>
                <h4 className="font-medium text-harbour-700 mb-1">Outlook</h4>
                <ol className="list-decimal list-inside space-y-0.5 text-harbour-500">
                  <li>Copy the calendar URL above</li>
                  <li>In Calendar: Add calendar &rarr; Subscribe from web</li>
                  <li>Paste the URL, name it, click Import</li>
                </ol>
              </div>
            </div>
          </details>
        </section>

        {/* RSS Feeds Section */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-harbour-700">RSS Feeds</h2>
            <p className="text-sm text-harbour-500 mt-1">
              Subscribe to RSS feeds to get updates delivered to your favorite reader.
            </p>
          </div>
          
          <div className="flex flex-col gap-3">
            {feeds.map((feed) => (
              <FeedCard key={feed.url} {...feed} />
            ))}
          </div>
          
          <details open className="group">
            <summary className="cursor-pointer text-sm font-medium text-harbour-600 hover:text-harbour-700 list-none flex items-center gap-1">
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              What is RSS?
            </summary>
            <div className="mt-4 pl-5 flex flex-col gap-3 text-sm text-harbour-600">
              <p className="text-harbour-500">
                RSS (Really Simple Syndication) lets you subscribe to updates from websites. 
                Instead of visiting each site, use an RSS reader to aggregate all your subscriptions in one place.
              </p>
              <div>
                <h4 className="font-medium text-harbour-700 mb-1">Popular RSS Readers</h4>
                <ul className="list-disc list-inside space-y-0.5 text-harbour-500">
                  <li><strong>NetNewsWire</strong> - Free, open source (Mac, iOS)</li>
                  <li><strong>Feedly</strong> - Web-based with free tier</li>
                  <li><strong>Reeder</strong> - Premium reader (Mac, iOS)</li>
                  <li><strong>Inoreader</strong> - Feature-rich web reader</li>
                </ul>
              </div>
            </div>
          </details>
        </section>

        {/* Social Media Section - Coming Soon */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-harbour-700">Social Media</h2>
            <p className="text-sm text-harbour-500 mt-1">
              Follow us on social media for updates and community discussions.
            </p>
          </div>
          
          <div className="p-6 ring-1 ring-harbour-200/50 bg-harbour-50/50 text-center">
            <p className="text-harbour-400 text-sm">Coming soon</p>
          </div>
        </section>

        {/* Newsletter Section - Coming Soon */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-harbour-700">Newsletter</h2>
            <p className="text-sm text-harbour-500 mt-1">
              Get a periodic digest of community highlights delivered to your inbox.
            </p>
          </div>
          
          <div className="p-6 ring-1 ring-harbour-200/50 bg-harbour-50/50 text-center">
            <p className="text-harbour-400 text-sm">Coming soon</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function CopyUrlCard({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-3 ring-1 ring-harbour-200/50">
      <div className="flex items-center gap-3">
        <code className="flex-1 text-sm text-harbour-600 truncate">{url}</code>
        <button
          onClick={copyToClipboard}
          className="shrink-0 px-3 py-1.5 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function FeedCard({ name, url, description }: { name: string; url: string; description: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-3 ring-1 ring-harbour-200/50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-harbour-700 text-sm">{name}</h3>
          <p className="text-xs text-harbour-500 mt-0.5">{description}</p>
        </div>
        <button
          onClick={copyToClipboard}
          className="shrink-0 px-3 py-1.5 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
