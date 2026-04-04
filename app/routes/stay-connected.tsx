import type { Route } from "./+types/stay-connected";
import { useState } from "react";
import { useLoaderData } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Stay Connected - siliconharbour.dev" },
    {
      name: "description",
      content: "Subscribe to the St. John's tech community calendar, RSS feeds, and more.",
    },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const siteUrl = process.env.SITE_URL || "https://siliconharbour.dev";
  const calendarUrl = `${siteUrl}/calendar.ics`;

  const feeds = [
    {
      name: "All Updates",
      url: `${siteUrl}/feed.rss`,
      description: "Everything - events, news, jobs, and more.",
    },
    {
      name: "Events",
      url: `${siteUrl}/events.rss`,
      description: "Meetups, talks, and other tech events.",
    },
    {
      name: "News",
      url: `${siteUrl}/news.rss`,
      description: "News and updates from the local tech community.",
    },
    {
      name: "Jobs",
      url: `${siteUrl}/jobs.rss`,
      description: "Job postings from tech companies in NL.",
    },
  ];

  return { calendarUrl, feeds };
}

export default function SubscribePage() {
  const { calendarUrl, feeds } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="prose mx-auto">
        <h1>Stay Connected</h1>

        <p className="text-lg">
          There are a few ways to keep up with what's happening without having to check this site
          constantly.
        </p>

        <h2>Calendar</h2>

        <p>
          Subscribe to the calendar and local tech events will automatically show up in your
          calendar app. It updates automatically, so you don't have to do anything once it's set up.
        </p>

        <CopyUrlCard url={calendarUrl} />

        <p>
          Need help? See instructions for{" "}
          <a
            href="https://support.google.com/calendar/answer/37118"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Calendar
          </a>
          ,{" "}
          <a
            href="https://support.apple.com/en-ca/guide/calendar/icl1023/mac"
            target="_blank"
            rel="noopener noreferrer"
          >
            Apple Calendar
          </a>
          , or{" "}
          <a
            href="https://support.microsoft.com/en-us/office/import-calendars-into-outlook-8e8364e1-400e-4c0f-a573-fe76b5a2d379"
            target="_blank"
            rel="noopener noreferrer"
          >
            Outlook
          </a>
          .
        </p>

        <h2>RSS Feeds</h2>

        <p>
          If you're the type of person who uses RSS (and you should be!), we've got feeds for
          everything. Not sure what RSS is?{" "}
          <a href="https://aboutfeeds.com/" target="_blank" rel="noopener noreferrer">
            About Feeds
          </a>{" "}
          is a good explainer.
        </p>

        <h3>All Updates</h3>
        <p>Everything from the site - events, news, jobs, and more.</p>
        <CopyUrlCard url={feeds[0].url} />

        <h3>Events</h3>
        <p>Just meetups, talks, and other tech events.</p>
        <CopyUrlCard url={feeds[1].url} />

        <h3>News</h3>
        <p>News and updates from the local community.</p>
        <CopyUrlCard url={feeds[2].url} />

        <h3>Jobs</h3>
        <p>Job postings from tech companies in NL.</p>
        <CopyUrlCard url={feeds[3].url} />

        <h2>Newsletter</h2>

        <div className="not-prose p-6 ring-1 ring-harbour-200/50 bg-harbour-50/50 text-center my-4">
          <p className="text-harbour-400 text-sm">Coming soon</p>
        </div>

        <h2>Social Media</h2>

        <div className="not-prose p-6 ring-1 ring-harbour-200/50 bg-harbour-50/50 text-center my-4">
          <p className="text-harbour-400 text-sm">Coming soon</p>
        </div>

        <h2>AI Assistant (MCP)</h2>

        <p>
          If you use an AI assistant that supports{" "}
          <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">
            MCP
          </a>
          , you can connect it directly to siliconharbour.dev. It can answer questions about
          upcoming events, local companies, job postings, community groups, and more — all from
          live data.
        </p>

        <p>
          Add this to your MCP client config (Claude Desktop, OpenCode, Cursor, etc.):
        </p>

        <CopyUrlCard url="https://siliconharbour.dev/mcp" label="MCP endpoint" />

        <p>
          See the <a href="/api">API docs</a> for full details including example queries and
          authenticated access for import sync actions.
        </p>
      </article>
    </div>
  );
}

function CopyUrlCard({ url, label }: { url: string; label?: string }) {
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
    <div className="not-prose p-3 ring-1 ring-harbour-200/50">
      <div className="flex items-center gap-3">
        {label && <span className="text-sm font-medium text-harbour-700 shrink-0">{label}</span>}
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
