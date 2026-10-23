import { page } from "../listing";
import { eventOutput } from "./events";
import { jobOutput } from "./jobs";
import { newsOutput } from "./news";
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
          lastAttemptAt: z.iso.datetime().nullable(),
          href: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export const reviewQueueOutput = page(
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("event"), record: eventOutput }).strict(),
    z.object({ type: z.literal("job"), record: jobOutput }).strict(),
    z.object({ type: z.literal("news"), record: newsOutput }).strict(),
  ]),
);
