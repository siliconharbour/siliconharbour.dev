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
export function buildEventsMessage(events: EventWithDates[], introText?: string): object[] {
  const innerComponents: object[] = [];

  // Intro text
  if (introText?.trim()) {
    innerComponents.push({ type: 10, content: introText.trim() });
    innerComponents.push({ type: 14, spacing: 1 });
  }

  events.forEach((event, index) => {
    const nextDate = event.dates[0];
    let dateLine = "Date TBD";
    if (nextDate) {
      dateLine = nextDate.isAllDay
        ? format(nextDate.startDate, "EEE, MMM d")
        : format(nextDate.startDate, "EEE, MMM d 'at' h:mm a");
    }
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
 * Build a single technical job's components (text + button).
 * Returns 2-3 inner components (text, action row, optional separator).
 */
function buildTechJobComponents(
  job: JobForDiscord,
  includeSeparator: boolean,
): object[] {
  const parts: string[] = [];
  if (job.companyName) parts.push(job.companyName);
  if (job.location) parts.push(job.location);
  if (job.workplaceType) {
    parts.push(job.workplaceType.charAt(0).toUpperCase() + job.workplaceType.slice(1));
  }
  const subtitle = parts.join(" \u2022 ");
  const textContent = `**${job.title}**${subtitle ? `\n${subtitle}` : ""}`;
  const jobUrl = job.url || `${SITE_URL}/jobs/${job.slug}`;

  const components: object[] = [
    { type: 10, content: textContent },
    { type: 1, components: [{ type: 2, style: 5, label: "Apply", url: jobUrl }] },
  ];
  if (includeSeparator) {
    components.push({ type: 14, spacing: 1 });
  }
  return components;
}

/**
 * Build the "Also hiring" non-technical section components.
 * Returns 2-3 inner components.
 */
function buildNonTechSection(
  nonTechnicalJobs: JobForDiscord[],
  needsLeadingSeparator: boolean,
): object[] {
  const components: object[] = [];
  if (needsLeadingSeparator) {
    components.push({ type: 14, spacing: 2 });
  }
  const lines = nonTechnicalJobs.map((job) => {
    const company = job.companyName ? ` - ${job.companyName}` : "";
    return `${job.title}${company}`;
  });
  const listContent = `**Also hiring**\n${lines.join("\n")}`;
  components.push({ type: 10, content: listContent });
  components.push({
    type: 1,
    components: [{ type: 2, style: 5, label: "View All Jobs", url: `${SITE_URL}/jobs` }],
  });
  return components;
}

/**
 * Discord Components v2 limit: max 40 TOTAL components per message,
 * counted recursively (container + its children + nested button inside action rows).
 *
 * Per technical job (recursive count):
 *   TextDisplay(1) + ActionRow(1) + Button-inside(1) + Separator(1) = 4
 *   Last job has no separator = 3
 *
 * Overhead: Container itself(1) + intro(2-3) + non-tech section(4) + continuation header(2)
 * Safe budget: ~8 overhead worst case → (40 - 8) / 4 = 8 tech jobs per message.
 */
const MAX_TOTAL_COMPONENTS = 40;
const TECH_JOB_TOTAL_COMPONENTS = 4; // text + actionRow + button + separator (recursive)
const OVERHEAD_BUDGET = 8; // container(1) + intro/header(3) + non-tech(4)
const SAFE_TECH_PER_CONTAINER = Math.floor(
  (MAX_TOTAL_COMPONENTS - OVERHEAD_BUDGET) / TECH_JOB_TOTAL_COMPONENTS,
);

/**
 * Build Components v2 payload for a jobs roundup message.
 *
 * Technical jobs get full treatment (title, subtitle, link button each).
 * Non-technical jobs are grouped into a compact "Also hiring" section
 * at the bottom of the last container.
 *
 * Returns an array of Container objects. When there are many jobs, multiple
 * containers are returned — each should be sent as a separate Discord message.
 * Discord limits containers to 40 child components each.
 */
export function buildJobsMessage(jobs: JobForDiscord[], introText?: string): object[][] {
  const technicalJobs = jobs.filter((j) => j.isTechnical);
  const nonTechnicalJobs = jobs.filter((j) => !j.isTechnical);

  // Chunk technical jobs into groups that fit within a single container
  const chunks: JobForDiscord[][] = [];
  for (let i = 0; i < technicalJobs.length; i += SAFE_TECH_PER_CONTAINER) {
    chunks.push(technicalJobs.slice(i, i + SAFE_TECH_PER_CONTAINER));
  }

  // Edge case: no technical jobs but have non-technical
  if (chunks.length === 0 && nonTechnicalJobs.length > 0) {
    chunks.push([]);
  }

  // Edge case: no jobs at all
  if (chunks.length === 0) {
    chunks.push([]);
  }

  const messages: object[][] = [];

  chunks.forEach((chunk, chunkIndex) => {
    const innerComponents: object[] = [];
    const isFirst = chunkIndex === 0;
    const isLast = chunkIndex === chunks.length - 1;

    // Intro text only on first message
    if (isFirst && introText?.trim()) {
      innerComponents.push({ type: 10, content: introText.trim() });
      innerComponents.push({ type: 14, spacing: 1 });
    }

    // Continuation header for subsequent messages
    if (!isFirst) {
      innerComponents.push({ type: 10, content: `**New jobs (continued)**` });
      innerComponents.push({ type: 14, spacing: 1 });
    }

    // Technical jobs in this chunk
    chunk.forEach((job, index) => {
      const isLastJob = index === chunk.length - 1;
      const needsSeparator = !isLastJob; // separator between jobs, not after last
      innerComponents.push(...buildTechJobComponents(job, needsSeparator));
    });

    // Non-technical section only on the last message
    if (isLast && nonTechnicalJobs.length > 0) {
      innerComponents.push(...buildNonTechSection(nonTechnicalJobs, chunk.length > 0));
    }

    messages.push([
      {
        type: 17,
        color: ACCENT_COLOR,
        components: innerComponents,
      },
    ]);
  });

  return messages;
}
