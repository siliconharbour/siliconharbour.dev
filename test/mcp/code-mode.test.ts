import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCodeMode } from "~/mcp/code-mode";
import { buildReadFunctions, buildExecuteFunctions, type HostFunction } from "~/mcp/bridge";

function hostFunction(run: (input: unknown) => Promise<unknown>): HostFunction {
  return Object.assign(run, {
    doc: { signature: "test(input)", description: "Test tool", category: "read" as const },
    inputSchema: z.object({}).passthrough(),
  });
}

describe("Code Mode", () => {
  it("isolates concurrent executions and recovers from failures on a reused runtime", async () => {
    const runtime = createCodeMode({ lookup: hostFunction(async (input) => input) });
    const bad = await Effect.runPromise(
      runtime.execute('const leaked = "bad"; throw new Error(leaked);'),
    );
    expect(bad).toMatchObject({ ok: false });
    const leaked = await Effect.runPromise(runtime.execute("return leaked;"));
    expect(leaked).toMatchObject({ ok: false, error: { kind: "ExecutionFailure" } });
    const results = await Promise.all(
      [1, 2].map((id) =>
        Effect.runPromise(
          runtime.execute(`const id = ${id}; return await tools.siliconharbour.lookup({ id });`),
        ),
      ),
    );
    expect(results).toMatchObject([
      { ok: true, value: { id: 1 } },
      { ok: true, value: { id: 2 } },
    ]);
  });

  it.each([
    ["busy loop", "while (true) {}"],
    ["pending host call", "return await tools.siliconharbour.wait({});"],
  ])("times out a %s", async (_label, code) => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const runtime = createCodeMode({ wait: hostFunction(() => pending) }, { timeoutMs: 50 });
    try {
      expect(await Effect.runPromise(runtime.execute(code))).toMatchObject({
        ok: false,
        error: { kind: "TimeoutExceeded" },
      });
      expect(await Effect.runPromise(runtime.execute("return 42;"))).toMatchObject({
        ok: true,
        value: 42,
      });
    } finally {
      finish();
    }
  });

  it("limits host calls before further side effects and retains the partial call history", async () => {
    const write = vi.fn(async () => ({ saved: true }));
    const runtime = createCodeMode({ write: hostFunction(write) }, { maxToolCalls: 2 });
    const result = await Effect.runPromise(
      runtime.execute(`
      await tools.siliconharbour.write({});
      await tools.siliconharbour.write({});
      return await tools.siliconharbour.write({});
    `),
    );
    expect(write).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "ToolCallLimitExceeded" },
      toolCalls: [{ name: "siliconharbour.write" }, { name: "siliconharbour.write" }],
    });
  });

  it("bounds result and log output and reports truncation", async () => {
    const runtime = createCodeMode({}, { maxOutputBytes: 64 });
    const result = await Effect.runPromise(
      runtime.execute('console.log("log".repeat(100)); return "value".repeat(100);'),
    );
    expect(result).toMatchObject({ ok: true, truncated: true });
    if (result.ok) expect(JSON.stringify(result.value).length).toBeLessThan(500);
  });

  it("sanitizes host failures and remains usable after a rejected call", async () => {
    const runtime = createCodeMode({
      fail: hostFunction(async () => {
        throw new Error("SECRET credentials");
      }),
    });
    const result = await Effect.runPromise(
      runtime.execute("return await tools.siliconharbour.fail({});"),
    );
    expect(result).toMatchObject({ ok: false, error: { kind: "ToolFailure" } });
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(await Effect.runPromise(runtime.execute("return 42;"))).toMatchObject({
      ok: true,
      value: 42,
    });
  });

  it.each([
    "return process.env;",
    "return await fetch('https://example.com');",
    "return ({}).constructor.constructor('return process')();",
  ])("rejects ambient host access: %s", async (code) => {
    expect(await Effect.runPromise(createCodeMode({}).execute(code))).toMatchObject({ ok: false });
  });

  it("returns actionable Zod validation failures", async () => {
    const runtime = createCodeMode(buildReadFunctions());
    const result = await Effect.runPromise(
      runtime.execute("return await tools.siliconharbour.jobs({ limit: 'bad' });"),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "ToolFailure", message: expect.stringContaining("limit") },
    });
  });

  it("discovers complete schema signatures only for tools in the supplied scope", async () => {
    const read = createCodeMode(buildReadFunctions());
    const write = createCodeMode(buildExecuteFunctions());
    const code = 'return search({ query: "createEntity" });';
    const found = await Effect.runPromise(write.execute(code));
    expect(found.ok).toBe(true);
    expect(JSON.stringify(found)).toContain("bio: string");
    expect(JSON.stringify(found)).toContain("Promise<unknown>");
    const absent = await Effect.runPromise(read.execute(code));
    expect(absent.ok).toBe(true);
    expect(JSON.stringify(absent)).not.toContain("siliconharbour.createEntity");
  });
});
