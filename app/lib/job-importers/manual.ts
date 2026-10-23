import type { FetchedJob } from "./types";
const VERAFIN_SOURCE_ID = 3;
const VERAFIN_SOURCE_IDENTIFIER = "nasdaq:Global_External_Site:verafin";

export function defaultLastVerifiedMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isVerafinManualSource(source: {
  id: number;
  sourceType: string;
  sourceIdentifier: string;
}): boolean {
  return (
    source.id === VERAFIN_SOURCE_ID &&
    source.sourceType === "workday" &&
    source.sourceIdentifier === VERAFIN_SOURCE_IDENTIFIER
  );
}

function sanitizeManualFetchedJob(input: unknown): FetchedJob | null {
  if (!input || typeof input !== "object") return null;

  const value = input as Record<string, unknown>;
  const externalId = typeof value.externalId === "string" ? value.externalId.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!externalId || !title) return null;

  const postedAt =
    typeof value.postedAt === "string" && value.postedAt.trim()
      ? new Date(value.postedAt)
      : undefined;

  return {
    externalId,
    title,
    location: typeof value.location === "string" ? value.location.trim() || undefined : undefined,
    department:
      typeof value.department === "string" ? value.department.trim() || undefined : undefined,
    descriptionHtml:
      typeof value.descriptionHtml === "string"
        ? value.descriptionHtml.trim() || undefined
        : undefined,
    descriptionText:
      typeof value.descriptionText === "string"
        ? value.descriptionText.trim() || undefined
        : undefined,
    url: typeof value.url === "string" ? value.url.trim() : "",
    workplaceType:
      value.workplaceType === "remote" ||
      value.workplaceType === "onsite" ||
      value.workplaceType === "hybrid"
        ? value.workplaceType
        : undefined,
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
    updatedAt: undefined,
  };
}

export function parseManualJobsJson(rawJson: string): { jobs?: FetchedJob[]; error?: string } {
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as Record<string, unknown>).jobs)
        ? ((parsed as Record<string, unknown>).jobs as unknown[])
        : null;

    if (!list) {
      return { error: "Manual JSON must be an array of jobs or an object with a jobs array." };
    }

    const jobs = list.map(sanitizeManualFetchedJob).filter(Boolean) as FetchedJob[];
    if (jobs.length === 0) {
      return { error: "No valid jobs found. Each job needs at least externalId and title." };
    }

    return { jobs };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid JSON payload." };
  }
}
