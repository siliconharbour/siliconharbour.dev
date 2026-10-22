import { z } from "zod";
export const asyncSyncOutput = z
  .object({
    id: z.string(),
    status: z.enum(["running", "completed", "failed"]),
    startedAt: z.string(),
    finishedAt: z.string().optional(),
    durationMs: z.number().optional(),
    steps: z.array(
      z
        .object({
          type: z.enum(["event", "job", "news"]),
          sourceId: z.number(),
          name: z.string(),
          status: z.enum(["running", "completed", "failed"]),
          startedAt: z.string(),
          finishedAt: z.string().optional(),
          durationMs: z.number().optional(),
          result: z.unknown().optional(),
          error: z.string().optional(),
        })
        .strict(),
    ),
    total: z.number(),
    completed: z.number(),
    failed: z.number(),
    current: z
      .object({ type: z.enum(["event", "job", "news"]), sourceId: z.number(), name: z.string() })
      .strict()
      .optional(),
  })
  .strict();
