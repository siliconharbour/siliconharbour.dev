import type { Route } from "./+types/stay-connected";
import { useState } from "react";
import { Form, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import { TurnstileInput } from "~/components/Turnstile";
import { checkRateLimit } from "~/lib/ratelimit.server";
import { getNewsletterFlags, hashNewsletterEmail, isNewsletterConfigured, subscribeToNewsletter } from "~/lib/newsletter.server";
import { getTurnstileSiteKey, verifyTurnstile } from "~/lib/turnstile.server";
import { buildSeoMeta } from "~/lib/seo";

export function meta({}: Route.MetaArgs) {
  return buildSeoMeta({
    title: "St. John's Tech Feeds and Updates",
    description:
      "Subscribe to the St. John's tech community calendar, RSS feeds, newsletter, and MCP server. Never miss a local tech event or update.",
    url: "/stay-connected",
  });
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

  const flags = await getNewsletterFlags();
  return { calendarUrl, feeds, newsletterEnabled: flags.publicSignup && isNewsletterConfigured(), turnstileSiteKey: getTurnstileSiteKey() };
}

export async function action({ request }: Route.ActionArgs) {
  const flags = await getNewsletterFlags();
  if (!flags.publicSignup || !isNewsletterConfigured()) return { error: "Newsletter signup is unavailable." };
  const form = await request.formData();
  const parsed = z.email().safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const email = parsed.data.trim().toLowerCase();
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), ip))) return { error: "Please complete the verification and try again." };
  const [emailLimit, ipLimit] = await Promise.all([
    checkRateLimit(`newsletter:email:${hashNewsletterEmail(email)}`, 2, 1800),
    checkRateLimit(`newsletter:ip:${hashNewsletterEmail(ip)}`, 10, 1800),
  ]);
  if (!emailLimit.allowed || !ipLimit.allowed) return { error: "Please wait before trying again." };
  try {
    await subscribeToNewsletter(email);
  } catch (error) {
    console.error("Newsletter signup failed", error);
    return { error: "Signup is temporarily unavailable. Please try again later." };
  }
  return { success: true };
}

export default function SubscribePage() {
  const { calendarUrl, feeds, newsletterEnabled, turnstileSiteKey } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

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

        {newsletterEnabled ? <div className="not-prose my-4 border border-harbour-200 bg-harbour-50 p-6">
          <p className="text-sm text-harbour-600">A hand-written digest of local tech news, events, and jobs. Confirm your address by email. You can unsubscribe from any issue.</p>
          {actionData?.success && <p className="mt-3 border border-green-200 bg-green-50 p-3 text-sm text-green-700">Check your inbox for a confirmation link.</p>}
          {actionData?.error && <p className="mt-3 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionData.error}</p>}
          <Form method="post" className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-harbour-700">Email address<input type="email" name="email" required className="mt-1 block w-full border border-harbour-200 bg-white px-3 py-2" /></label>
            {turnstileSiteKey && <TurnstileInput siteKey={turnstileSiteKey} />}
            <button className="bg-harbour-600 px-4 py-2 text-sm font-medium text-white hover:bg-harbour-700">Subscribe</button>
          </Form>
        </div> : <div className="not-prose my-4 border border-harbour-200 bg-harbour-50 p-6 text-center"><p className="text-sm text-harbour-400">Coming soon</p></div>}

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
          , you can connect it directly to siliconharbour.dev.
        </p>

        <p>Add this to your MCP client config (Claude Desktop, OpenCode, Cursor, etc.):</p>

        <CopyUrlCard url="https://siliconharbour.dev/mcp" label="MCP endpoint" />

        <p>
          Public search and read tools work without signing in. OAuth is optional and unlocks
          administrative tools for authorized accounts through the site&apos;s normal login and
          consent flow.
        </p>

        <p>
          See the <a href="/api">API docs</a> for full details including example queries.
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
