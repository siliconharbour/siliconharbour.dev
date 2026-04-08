import { format } from "date-fns";
import type { EventWithDates } from "~/lib/events.server";
import { parseRecurrenceRule, describeRecurrenceRule } from "~/lib/recurrence.server";

const SITE_URL = process.env.SITE_URL || "https://siliconharbour.dev";
const ACCENT_COLOR = 0x2b51d1; // harbour-600

export interface JobForDiscord {
  slug: string;
  title: string;
  location: string | null;
  workplaceType: string | null;
  companyName: string | null;
  isTechnical: boolean;
  url: string | null;
}

/**
 * Build Components v2 payload for an events roundup message.
 */
export function buildEventsMessage(
  events: EventWithDates[],
  introText?: string
): object[] {
  const innerComponents: object[] = [];

  // Intro text
  if (introText?.trim()) {
    innerComponents.push({ type: 10, content: introText.trim() });
    innerComponents.push({ type: 14, spacing: 1 });
  }

  events.forEach((event, index) => {
    const nextDate = event.dates[0];
    let dateLine = nextDate
      ? format(nextDate.startDate, "EEE, MMM d 'at' h:mm a")
      : "Date TBD";
    if (event.recurrenceRule) {
      const parsed = parseRecurrenceRule(event.recurrenceRule);
      if (parsed) dateLine += ` (${describeRecurrenceRule(parsed)})`;
    }
    const parts = [dateLine];
    if (event.location) parts.push(event.location);
    const subtitle = parts.join(" \u2022 ");

    // Truncate description to ~150 chars for the preview
    const desc = (event.description || "").replace(/[#*_~`>[\]]/g, "").trim();
    const shortDesc = desc.length > 150 ? desc.slice(0, 147) + "..." : desc;
    const textContent = `**${event.title}**\n${subtitle}${shortDesc ? `\n${shortDesc}` : ""}`;

    const eventUrl = `${SITE_URL}/events/${event.slug}`;

    // Use Section with thumbnail if cover image exists, otherwise plain TextDisplay
    const hasCover = event.coverImage || event.coverImageUrl;
    if (hasCover) {
      const imageUrl = event.coverImageUrl || `${SITE_URL}/images/${event.coverImage}`;
      innerComponents.push({
        type: 9,
        components: [{ type: 10, content: textContent }],
        accessory: {
          type: 11,
          media: { url: imageUrl },
        },
      });
    } else {
      innerComponents.push({ type: 10, content: textContent });
    }

    // Link button
    innerComponents.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: "More Info",
          url: eventUrl,
        },
      ],
    });

    // Separator between events (not after the last one)
    if (index < events.length - 1) {
      innerComponents.push({ type: 14, spacing: 1 });
    }
  });

  // Wrap in a Container with accent color
  return [
    {
      type: 17,
      color: ACCENT_COLOR,
      components: innerComponents,
    },
  ];
}

/**
 * Build Components v2 payload for a jobs roundup message.
 *
 * Technical jobs get full treatment (title, subtitle, link button each).
 * Non-technical jobs are grouped into a compact "Also hiring" section
 * at the bottom with just title + company as a bullet list.
 */
export function buildJobsMessage(
  jobs: JobForDiscord[],
  introText?: string
): object[] {
  const technicalJobs = jobs.filter((j) => j.isTechnical);
  const nonTechnicalJobs = jobs.filter((j) => !j.isTechnical);

  const innerComponents: object[] = [];

  // Intro text
  if (introText?.trim()) {
    innerComponents.push({ type: 10, content: introText.trim() });
    innerComponents.push({ type: 14, spacing: 1 });
  }

  // Technical jobs: full treatment
  technicalJobs.forEach((job, index) => {
    const parts: string[] = [];
    if (job.companyName) parts.push(job.companyName);
    if (job.location) parts.push(job.location);
    if (job.workplaceType) {
      parts.push(
        job.workplaceType.charAt(0).toUpperCase() + job.workplaceType.slice(1)
      );
    }
    const subtitle = parts.join(" \u2022 ");
    const textContent = `**${job.title}**${subtitle ? `\n${subtitle}` : ""}`;

    const jobUrl = job.url || `${SITE_URL}/jobs/${job.slug}`;

    innerComponents.push({ type: 10, content: textContent });

    // Link button -- points to external application page
    innerComponents.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: "Apply",
          url: jobUrl,
        },
      ],
    });

    // Separator between technical jobs (not after the last one if no non-technical follow)
    if (index < technicalJobs.length - 1) {
      innerComponents.push({ type: 14, spacing: 1 });
    }
  });

  // Non-technical jobs: compact grouped section
  if (nonTechnicalJobs.length > 0) {
    if (technicalJobs.length > 0) {
      innerComponents.push({ type: 14, spacing: 2 });
    }

    const lines = nonTechnicalJobs.map((job) => {
      const company = job.companyName ? ` - ${job.companyName}` : "";
      return `${job.title}${company}`;
    });
    const listContent = `**Also hiring**\n${lines.join("\n")}`;
    innerComponents.push({ type: 10, content: listContent });

    // Single link to the jobs page
    innerComponents.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: "View All Jobs",
          url: `${SITE_URL}/jobs`,
        },
      ],
    });
  }

  // Wrap in a Container with accent color
  return [
    {
      type: 17,
      color: ACCENT_COLOR,
      components: innerComponents,
    },
  ];
}
