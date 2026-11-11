import { db } from "~/db";
import { importJobs } from "~/db/schema";
import { eq } from "drizzle-orm";
import { ConflictError } from "~/operations/errors";
import type { ImportJob } from "~/db/schema";

export function importRunState(job: ImportJob | undefined, now = Date.now()) {
  const waitingForRateLimit =
    job?.status === "paused" &&
    job.pauseReason === "rate_limit" &&
    job.rateLimitReset !== null &&
    job.rateLimitReset * 1000 > now;
  return {
    runId: job?.runId ?? null,
    pauseReason: job?.pauseReason ?? null,
    waitingForRateLimit,
    canResume: job?.status === "paused" || job?.status === "failed",
  };
}

export function assertImportRun(job: ImportJob | undefined, runId: string | null) {
  if ((job?.runId ?? null) !== runId)
    throw new ConflictError("Import run has changed. Reload its progress before continuing.");
}

export function readImportJob(id: string) {
  return db.select().from(importJobs).where(eq(importJobs.id, id)).get();
}
