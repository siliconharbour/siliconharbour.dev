import type { OperationContext } from "~/operations/context";
import type { z } from "zod";
import type { eventSyncOutput } from "~/operations/contracts/events";
import type { jobSyncOutput } from "~/operations/contracts/jobs";
import type { newsSyncOutput } from "~/operations/contracts/news";
import { randomUUID } from "node:crypto";
import { ConflictError } from "~/operations/errors";
import { formatError } from "~/mcp/errors";

type SyncResult =
  | z.output<typeof eventSyncOutput>
  | z.output<typeof jobSyncOutput>
  | z.output<typeof newsSyncOutput>;
export type AsyncSyncTaskType = "event" | "job" | "news";
type Source = { type: AsyncSyncTaskType; sourceId: number; name: string };
export type AsyncSyncTask = Source & { run: () => Promise<SyncResult> };
type Finished = { finishedAt: string; durationMs: number };
type AsyncSyncStep = Source & { startedAt: string } & (
    | { status: "running" }
    | (Finished & { status: "completed"; result: SyncResult })
    | (Finished & { status: "failed"; error: string; result?: SyncResult })
  );
type RunData = {
  id: string;
  startedAt: string;
  total: number;
  steps: AsyncSyncStep[];
  startedBy: number | null;
  via: "mcp" | "admin-ui" | null;
};
type AsyncSync = RunData &
  (
    | { status: "running"; current?: Source }
    | (Finished & { status: "completed" })
    | (Finished & { status: "failed"; error?: string })
  );
const asyncSyncs = new Map<string, AsyncSync>();
const MAX_STORED_ASYNC_SYNCS = 20;
function finished(startedAt: string): Finished {
  const finishedAt = new Date().toISOString();
  return { finishedAt, durationMs: Date.parse(finishedAt) - Date.parse(startedAt) };
}
function reserveRunSlot() {
  if (asyncSyncs.size < MAX_STORED_ASYNC_SYNCS) return;
  const oldest = [...asyncSyncs.values()].find((run) => run.status !== "running");
  if (!oldest)
    throw new ConflictError("Too many source syncs are running. Wait for one to finish.");
  asyncSyncs.delete(oldest.id);
}
async function runTasks(initial: AsyncSync & { status: "running" }, tasks: AsyncSyncTask[]) {
  let run = initial;
  for (const task of tasks) {
    const { type, sourceId, name } = task;
    const source = { type, sourceId, name };
    const step: AsyncSyncStep = {
      ...source,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    run = { ...run, current: source, steps: [...run.steps, step] };
    asyncSyncs.set(run.id, run);
    let outcome: AsyncSyncStep;
    try {
      const result = await task.run();
      outcome = result.success
        ? { ...step, ...finished(step.startedAt), status: "completed", result }
        : {
            ...step,
            ...finished(step.startedAt),
            status: "failed",
            result,
            error: result.error ?? "Source sync failed",
          };
    } catch (error) {
      outcome = {
        ...step,
        ...finished(step.startedAt),
        status: "failed",
        error: formatError(error),
      };
    }
    run = { ...run, current: undefined, steps: [...run.steps.slice(0, -1), outcome] };
    asyncSyncs.set(run.id, run);
  }
  const { current: _, status: __, ...data } = run;
  asyncSyncs.set(run.id, {
    ...data,
    ...finished(run.startedAt),
    status: run.steps.some((step) => step.status === "failed") ? "failed" : "completed",
  });
}
export function startAsyncSync(tasks: AsyncSyncTask[], actor: OperationContext["actor"] = null) {
  reserveRunSlot();
  const run: AsyncSync & { status: "running" } = {
    id: randomUUID(),
    status: "running",
    startedAt: new Date().toISOString(),
    total: tasks.length,
    steps: [],
    startedBy: actor?.userId ?? null,
    via: actor?.via ?? null,
  };
  asyncSyncs.set(run.id, run);
  void runTasks(run, tasks).catch((error) => {
    const current = asyncSyncs.get(run.id)!;
    const { status: _, ...data } = current;
    asyncSyncs.set(run.id, {
      ...data,
      ...finished(run.startedAt),
      status: "failed",
      steps: current.steps.map((step) =>
        step.status === "running"
          ? { ...step, ...finished(step.startedAt), status: "failed", error: formatError(error) }
          : step,
      ),
      error: formatError(error),
    });
  });
  return summarizeAsyncSync(asyncSyncs.get(run.id)!);
}
export function getAsyncSync(runId: string) {
  const run = asyncSyncs.get(runId);
  return run ? summarizeAsyncSync(run) : null;
}
export function listAsyncSyncs() {
  return [...asyncSyncs.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(summarizeAsyncSync);
}
export function summarizeAsyncSync(run: AsyncSync) {
  return {
    ...run,
    current: run.status === "running" ? run.current : undefined,
    error: run.status === "failed" ? run.error : undefined,
    finishedAt: run.status === "running" ? undefined : run.finishedAt,
    durationMs: run.status === "running" ? undefined : run.durationMs,
    completed: run.steps.filter((step) => step.status === "completed").length,
    failed: run.steps.filter((step) => step.status === "failed").length,
    // Callers receive snapshots, never the registry's mutable step array.
    steps: run.steps.map((step) => ({
      ...step,
      error: step.status === "failed" ? step.error : undefined,
      result: step.status === "running" ? undefined : step.result,
      finishedAt: step.status === "running" ? undefined : step.finishedAt,
      durationMs: step.status === "running" ? undefined : step.durationMs,
    })),
  };
}
