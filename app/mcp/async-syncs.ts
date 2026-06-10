import { randomUUID } from "node:crypto";
import { formatSandboxError } from "./sandbox.js";

type AsyncSyncStatus = "running" | "completed" | "failed";

export type AsyncSyncTaskType = "event" | "job" | "news";

export type AsyncSyncTask = {
  type: AsyncSyncTaskType;
  sourceId: number;
  name: string;
  run: () => Promise<unknown>;
};

type AsyncSyncStep = {
  type: AsyncSyncTaskType;
  sourceId: number;
  name: string;
  status: AsyncSyncStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  result?: unknown;
  error?: string;
};

type AsyncSync = {
  id: string;
  status: AsyncSyncStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  total: number;
  completed: number;
  failed: number;
  current?: { type: AsyncSyncTaskType; sourceId: number; name: string };
  steps: AsyncSyncStep[];
};

const asyncSyncs = new Map<string, AsyncSync>();
const MAX_STORED_ASYNC_SYNCS = 20;

function nowIso() {
  return new Date().toISOString();
}

function trimStoredRuns() {
  const overflow = asyncSyncs.size - MAX_STORED_ASYNC_SYNCS;
  if (overflow <= 0) return;

  const removable = [...asyncSyncs.values()]
    .filter((run) => run.status !== "running")
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(0, overflow);

  for (const run of removable) asyncSyncs.delete(run.id);
}

async function runTasks(run: AsyncSync, tasks: AsyncSyncTask[]) {
  for (const task of tasks) {
    run.current = { type: task.type, sourceId: task.sourceId, name: task.name };
    const stepStartedAt = nowIso();
    const stepStartMs = Date.now();
    const step: AsyncSyncStep = {
      type: task.type,
      sourceId: task.sourceId,
      name: task.name,
      status: "running",
      startedAt: stepStartedAt,
    };
    run.steps.push(step);

    try {
      step.result = await task.run();
      step.status = "completed";
      run.completed += 1;
    } catch (error) {
      step.status = "failed";
      step.error = formatSandboxError(error);
      run.failed += 1;
    } finally {
      step.finishedAt = nowIso();
      step.durationMs = Date.now() - stepStartMs;
    }
  }

  run.current = undefined;
  run.finishedAt = nowIso();
  run.durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
  run.status = run.failed > 0 ? "failed" : "completed";
  trimStoredRuns();
}

export function startAsyncSync(tasks: AsyncSyncTask[]) {
  const id = randomUUID();
  const run: AsyncSync = {
    id,
    status: "running",
    startedAt: nowIso(),
    total: tasks.length,
    completed: 0,
    failed: 0,
    steps: [],
  };
  asyncSyncs.set(id, run);

  void runTasks(run, tasks).catch((error) => {
    run.status = "failed";
    run.current = undefined;
    run.finishedAt = nowIso();
    run.durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
    run.failed += Math.max(1, run.total - run.completed - run.failed);
    run.steps.push({
      type: "job",
      sourceId: 0,
      name: "async sync",
      status: "failed",
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
      error: formatSandboxError(error),
    });
    trimStoredRuns();
  });

  return summarizeAsyncSync(run);
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
    id: run.id,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    total: run.total,
    completed: run.completed,
    failed: run.failed,
    current: run.current,
    steps: run.steps.map((step) => ({
      type: step.type,
      sourceId: step.sourceId,
      name: step.name,
      status: step.status,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      durationMs: step.durationMs,
      result: step.result,
      error: step.error,
    })),
  };
}
