import { z } from "zod";
import { parsePagination, type PaginationParams } from "./api.server";
import type { EventFilter } from "./events.server";
import { jobsWorkplaceFilterOptions, type JobsWorkplaceFilterType } from "./public-query";

const searchSchema = z.object({
  q: z.string().optional().default(""),
});

const eventFilterSchema = z.enum(["upcoming", "past", "all"] satisfies EventFilter[]);

const technicalSchema = z.enum(["false"]).optional();

const workplaceSchema = z
  .string()
  .optional()
  .transform((value) => (value ? value.split("|").map((part) => part.trim()).filter(Boolean) : []));

export interface PublicListParams extends PaginationParams {
  searchQuery: string;
}

export function parsePublicListParams(url: URL): PublicListParams {
  const { limit, offset } = parsePagination(url);
  const parsed = searchSchema.parse({
    q: url.searchParams.get("q") ?? undefined,
  });
  return { limit, offset, searchQuery: parsed.q };
}

export function parseEventsQuery(url: URL): PublicListParams & { filter: EventFilter; dateFilter?: string } {
  const base = parsePublicListParams(url);
  const filter = eventFilterSchema.parse((url.searchParams.get("filter") as EventFilter | null) ?? "upcoming");
  const dateFilter = url.searchParams.get("date") || undefined;
  return { ...base, filter, dateFilter };
}

export function parseJobsQuery(url: URL): {
  searchQuery: string;
  showNonTechnical: boolean;
  selectedWorkplaceTypes: JobsWorkplaceFilterType[];
} {
  const parsed = z
    .object({
      q: z.string().optional().default(""),
      technical: technicalSchema,
      workplace: workplaceSchema,
    })
    .parse({
      q: url.searchParams.get("q") ?? undefined,
      technical: url.searchParams.get("technical") ?? undefined,
      workplace: url.searchParams.get("workplace") ?? undefined,
    });

  const selectedWorkplaceTypes = parsed.workplace.filter((value): value is JobsWorkplaceFilterType =>
    jobsWorkplaceFilterOptions.includes(value as JobsWorkplaceFilterType),
  );

  return {
    searchQuery: parsed.q,
    showNonTechnical: parsed.technical === "false",
    selectedWorkplaceTypes:
      selectedWorkplaceTypes.length > 0 ? selectedWorkplaceTypes : [...jobsWorkplaceFilterOptions],
  };
}

export function parseMarkdownListParams(url: URL): PublicListParams {
  const parsed = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
      q: z.string().default(""),
    })
    .parse({
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });

  return {
    limit: parsed.limit,
    offset: parsed.offset,
    searchQuery: parsed.q,
  };
}
