import { describe, expect, it, vi } from "vitest";
import { getAsyncSync, startAsyncSync } from "~/lib/async-syncs.server";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("MCP async syncs", () => {
  it("returns a running async sync immediately and lets callers poll for completion", async () => {
    const task = deferred<{
      success: boolean;
      added: number;
      updated: number;
      removed: number;
      reactivated: number;
      totalActive: number;
    }>();
    const runner = vi.fn(() => task.promise);

    const started = startAsyncSync([{ type: "job", sourceId: 123, name: "example", run: runner }]);

    expect(started.status).toBe("running");
    expect(started.total).toBe(1);
    expect(started.completed).toBe(0);
    expect(runner).toHaveBeenCalledTimes(1);

    const running = getAsyncSync(started.id);
    expect(running?.status).toBe("running");
    expect(running?.current).toMatchObject({ type: "job", sourceId: 123, name: "example" });

    task.resolve({
      success: true,
      added: 2,
      updated: 0,
      removed: 0,
      reactivated: 0,
      totalActive: 2,
    });
    await vi.waitFor(() => expect(getAsyncSync(started.id)?.status).toBe("completed"));

    const completed = getAsyncSync(started.id);
    expect(completed).toMatchObject({ status: "completed", completed: 1, failed: 0 });
    expect(completed?.steps[0]).toMatchObject({
      type: "job",
      sourceId: 123,
      name: "example",
      status: "completed",
      result: { added: 2 },
    });
  });

  it("records failed tasks without collapsing object errors", async () => {
    const task = deferred<never>();
    const started = startAsyncSync([
      { type: "event", sourceId: 5, name: "bad source", run: () => task.promise },
    ]);

    task.reject({ message: "fetch blew up", code: "E_FETCH" });
    await vi.waitFor(() => expect(getAsyncSync(started.id)?.status).toBe("failed"));

    const failed = getAsyncSync(started.id);
    expect(failed).toMatchObject({ status: "failed", completed: 0, failed: 1 });
    expect(failed?.steps[0]?.error).toContain("fetch blew up");
    expect(failed?.steps[0]?.error).toContain("E_FETCH");
  });
});

it("retains failed importer results and the initiating administrator", async () => {
  const started = startAsyncSync(
    [
      {
        type: "event",
        sourceId: 1,
        name: "Failed source",
        run: async () => ({
          success: false,
          added: 0,
          skipped: 0,
          removed: 0,
          error: "Rate limited",
          rateLimited: true,
        }),
      },
    ],
    { userId: 42, role: "admin", via: "mcp" },
  );
  await vi.waitFor(() => expect(getAsyncSync(started.id)?.status).toBe("failed"));
  expect(getAsyncSync(started.id)).toMatchObject({
    startedBy: 42,
    via: "mcp",
    completed: 0,
    failed: 1,
    steps: [
      { status: "failed", error: "Rate limited", result: { success: false, rateLimited: true } },
    ],
  });
});
