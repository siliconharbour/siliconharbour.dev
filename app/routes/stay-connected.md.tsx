import type { Route } from "./+types/stay-connected.md";
import { markdownResponse } from "~/lib/markdown.server";

export async function loader({}: Route.LoaderArgs) {
  const siteUrl = process.env.SITE_URL || "https://siliconharbour.dev";

  const content = `---
type: page
title: Stay Connected
url: ${siteUrl}/stay-connected
---

# Stay Connected

There are a few ways to keep up with what's happening without having to check this site constantly.

## Calendar

Subscribe to the calendar and local tech events will automatically show up in your calendar app. It updates automatically, so you don't have to do anything once it's set up.

**Calendar URL:** \`${siteUrl}/calendar.ics\`

Need help? See instructions for:
- [Google Calendar](https://support.google.com/calendar/answer/37118)
- [Apple Calendar](https://support.apple.com/en-ca/guide/calendar/icl1023/mac)
- [Outlook](https://support.microsoft.com/en-us/office/import-calendars-into-outlook-8e8364e1-400e-4c0f-a573-fe76b5a2d379)

## RSS Feeds

If you're the type of person who uses RSS (and you should be!), we've got feeds for everything. Not sure what RSS is? [About Feeds](https://aboutfeeds.com/) is a good explainer.

### All Updates

Everything from the site - events, news, jobs, and more.

**URL:** \`${siteUrl}/feed.rss\`

### Events

Just meetups, talks, and other tech events.

**URL:** \`${siteUrl}/events.rss\`

### News

News and updates from the local community.

**URL:** \`${siteUrl}/news.rss\`

### Jobs

Job postings from tech companies in NL.

**URL:** \`${siteUrl}/jobs.rss\`

## Newsletter

Coming soon.

## Social Media

Coming soon.
`;

  return markdownResponse(content);
}
