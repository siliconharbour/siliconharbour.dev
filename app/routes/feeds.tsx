import type { Route } from "./+types/feeds";
import { useState } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "RSS Feeds - siliconharbour.dev" },
    { name: "description", content: "Subscribe to RSS feeds from the St. John's tech community." },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const siteUrl = process.env.SITE_URL || "https://siliconharbour.dev";
  return { siteUrl };
}

export default function FeedsPage({ loaderData }: Route.ComponentProps) {
  const { siteUrl } = loaderData;

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

  return (
    <div className="max-w-3xl mx-auto p-4 py-8">
      <h1 className="text-2xl font-bold text-harbour-700 mb-2">RSS Feeds</h1>
      <p className="text-harbour-500 mb-8">
        Subscribe to our RSS feeds to stay up-to-date with the St. John's tech community.
      </p>

      {/* What is RSS */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-harbour-700 mb-3">What is RSS?</h2>
        <p className="text-harbour-600 mb-4">
          RSS (Really Simple Syndication) is a way to subscribe to updates from websites. 
          Instead of visiting each site manually, you can use an RSS reader to aggregate 
          all your subscriptions in one place. When new content is published, it automatically 
          appears in your reader.
        </p>
      </section>

      {/* Available Feeds */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-harbour-700 mb-4">Available Feeds</h2>
        <div className="flex flex-col gap-4">
          {feeds.map((feed) => (
            <FeedCard key={feed.url} {...feed} />
          ))}
        </div>
      </section>

      {/* How to Subscribe */}
      <section>
        <h2 className="text-lg font-semibold text-harbour-700 mb-4">How to Subscribe</h2>
        
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="font-medium text-harbour-700 mb-2">Desktop RSS Readers</h3>
            <ul className="text-harbour-600 list-disc list-inside space-y-1">
              <li><strong>NetNewsWire</strong> (Mac, iOS) - Free and open source</li>
              <li><strong>Reeder</strong> (Mac, iOS) - Beautiful, premium reader</li>
              <li><strong>Thunderbird</strong> (Windows, Mac, Linux) - Free email client with RSS support</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-harbour-700 mb-2">Web-based Readers</h3>
            <ul className="text-harbour-600 list-disc list-inside space-y-1">
              <li><strong>Feedly</strong> - Popular web-based reader with free tier</li>
              <li><strong>Inoreader</strong> - Feature-rich with powerful filtering</li>
              <li><strong>Feedbin</strong> - Clean, minimalist paid option</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-harbour-700 mb-2">Steps to Subscribe</h3>
            <ol className="text-harbour-600 list-decimal list-inside space-y-1">
              <li>Copy the feed URL using the button next to the feed you want</li>
              <li>Open your RSS reader application</li>
              <li>Look for "Add Feed", "Subscribe", or a + button</li>
              <li>Paste the URL and confirm</li>
            </ol>
          </div>
        </div>
      </section>
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
    } catch (err) {
      // Fallback for older browsers
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
    <div className="p-4 ring-1 ring-harbour-200/50">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-harbour-700">{name}</h3>
          <p className="text-sm text-harbour-500 mt-1">{description}</p>
          <code className="block text-xs text-harbour-400 mt-2 truncate">{url}</code>
        </div>
        <button
          onClick={copyToClipboard}
          className="shrink-0 px-3 py-1.5 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
        >
          {copied ? "Copied!" : "Copy URL"}
        </button>
      </div>
    </div>
  );
}
