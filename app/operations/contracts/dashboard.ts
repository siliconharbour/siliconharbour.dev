import { z } from "zod";
export const dashboardOutput = z
  .object({
    counts: z
      .object({
        events: z.number(),
        companies: z.number(),
        groups: z.number(),
        education: z.number(),
        people: z.number(),
        news: z.number(),
        jobs: z.number(),
        projects: z.number(),
        products: z.number(),
        technologies: z.number(),
        comments: z.number(),
      })
      .strict(),
    pending: z
      .object({ events: z.number(), news: z.number(), jobs: z.number(), total: z.number() })
      .strict(),
    importFailures: z.array(
      z
        .object({
          id: z.number(),
          kind: z.enum(["event", "job", "news"]),
          name: z.string(),
          error: z.string().nullable(),
          lastAttemptAt: z.string().nullable(),
          href: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export const reviewQueueOutput = z
  .object({
    events: z.array(
      z
        .object({
          id: z.number(),
          title: z.string(),
          organizer: z.string().nullable(),
          location: z.string().nullable(),
          link: z.string(),
          coverImageUrl: z.string().nullable(),
          sourceId: z.number().nullable(),
          sourceName: z.string().nullable(),
          startDate: z.string().nullable(),
        })
        .strict(),
    ),
    news: z.array(
      z
        .object({
          id: z.number(),
          title: z.string(),
          externalUrl: z.string().nullable(),
          sourceName: z.string().nullable(),
          excerpt: z.string().nullable(),
          publishedAt: z.string().nullable(),
          sourceType: z.string().nullable(),
        })
        .strict(),
    ),
    jobs: z.array(
      z
        .object({
          id: z.number(),
          title: z.string(),
          location: z.string().nullable(),
          workplaceType: z.string().nullable(),
          url: z.string().nullable(),
          companyName: z.string().nullable(),
          sourceType: z.string().nullable(),
          postedAt: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
