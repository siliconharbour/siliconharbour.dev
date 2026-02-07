/**
 * Digital Six Consulting custom scraper
 *
 * Careers are powered by the WordPress plugin "WP Job Openings",
 * exposed via the REST endpoint:
 *   /wp-json/wp/v2/awsm_job_openings
 */

import type { FetchedJob, WorkplaceType } from "../types";
import { fetchJson, htmlToText } from "./utils";

const JOBS_API_URL =
  "https://digitalsixconsulting.com/wp-json/wp/v2/awsm_job_openings?per_page=100&status=publish";

interface WpAwsmJob {
  id: number;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  link: string;
  date: string;
  modified: string;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractLocation(text: string): string | undefined {
  const match = text.match(/Location:\s*(.*?)(?:\s+Type:|$)/i);
  if (!match?.[1]) return undefined;
  return normalize(match[1]);
}

function detectWorkplaceType(locationText?: string, contentText?: string): WorkplaceType | undefined {
  const haystack = `${locationText ?? ""} ${contentText ?? ""}`.toLowerCase();
  if (haystack.includes("hybrid")) return "hybrid";
  if (haystack.includes("remote")) return "remote";
  if (haystack.includes("on-site") || haystack.includes("onsite") || haystack.includes("on site")) {
    return "onsite";
  }
  return undefined;
}

export async function scrapeDigitalSix(): Promise<FetchedJob[]> {
  const jobs = await fetchJson<WpAwsmJob[]>(JOBS_API_URL);

  return jobs
    .map((job) => {
      const title = normalize(htmlToText(job.title.rendered));
      const descriptionHtml = job.content.rendered;
      const rawDescriptionText = htmlToText(descriptionHtml);
      const descriptionText = normalize(rawDescriptionText);
      const location = extractLocation(rawDescriptionText);

      if (!title) return null;

      return {
        externalId: String(job.id),
        title,
        location,
        descriptionHtml: descriptionHtml || undefined,
        descriptionText: descriptionText || undefined,
        url: job.link,
        workplaceType: detectWorkplaceType(location, descriptionText),
        postedAt: job.date ? new Date(job.date) : undefined,
        updatedAt: job.modified ? new Date(job.modified) : undefined,
      } satisfies FetchedJob;
    })
    .filter((job): job is FetchedJob => job !== null);
}
