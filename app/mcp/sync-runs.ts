import { randomUUID } from "node:crypto";
import { formatSandboxError } from "./sandbox.js";

type SyncRunStatus = "running" | "completed" | "failed";

export type SyncRunTask = {
  type: "event" | "job";
  sourceId: number;
  name: string;
  run: () => Promise<unknown>;
};

type SyncRunStep = {
  type: "event" | "job";
  sourceId: number;
  name: string;
  status: SyncRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  result?: unknown;
  error?: string;
};

type SyncRun = {
  id: string;
  status: SyncRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  total: number;
  completed: number;
  failed: number;
  current?: { type: "event" | "job"; sourceId: number; name: string };
  steps: SyncRunStep[];
};

const syncRuns = new Map<string, SyncRun>();
const MAX_STORED_RUNS = 20;

function nowIso() {
  return new Date().toISOString();
}

function trimStoredRuns() {
  const overflow = syncRuns.size - MAX_STORED_RUNS;
  if (overflow <= 0) return;

  const removable = [...syncRuns.values()]
    .filter((run) => run.status !== "running")
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(0, overflow);

  for (const run of removable) syncRuns.delete(run.id);
}

async function runTasks(run: SyncRun, tasks: SyncRunTask[]) {
  for (const task of tasks) {
    run.current = { type: task.type, sourceId: task.sourceId, name: task.name };
    const stepStartedAt = nowIso();
    const stepStartMs = Date.now();
    const step: SyncRunStep = {
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

export function startSyncRun(tasks: SyncRunTask[]) {
  const id = randomUUID();
  const run: SyncRun = {
    id,
    status: "running",
    startedAt: nowIso(),
    total: tasks.length,
    completed: 0,
    failed: 0,
    steps: [],
  };
  syncRuns.set(id, run);

  void runTasks(run, tasks).catch((error) => {
    run.status = "failed";
    run.current = undefined;
    run.finishedAt = nowIso();
    run.durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
    run.failed += Math.max(1, run.total - run.completed - run.failed);
    run.steps.push({
      type: "job",
      sourceId: 0,
      name: "sync run",
      status: "failed",
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
      error: formatSandboxError(error),
    });
    trimStoredRuns();
  });

  return summarizeSyncRun(run);
}

export function getSyncRun(runId: string) {
  const run = syncRuns.get(runId);
  return run ? summarizeSyncRun(run) : null;
}

export function listSyncRuns() {
  return [...syncRuns.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(summarizeSyncRun);
}

export function summarizeSyncRun(run: SyncRun) {
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
