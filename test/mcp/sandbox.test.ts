import { describe, expect, it, vi } from "vitest";
import { formatSandboxError, runInSandbox, createCodeMode } from "~/mcp/sandbox";
import { buildReadFunctions, buildExecuteFunctions } from "~/mcp/bridge";

describe("formatSandboxError", () => {
  it("keeps object error details instead of returning [object Object]", () => {
    expect(formatSandboxError({ message: "boom", code: "E_BOOM" })).toContain("boom");
    expect(formatSandboxError({ message: "boom", code: "E_BOOM" })).toContain("E_BOOM");
  });

  it("serializes plain objects without message-like fields", () => {
    expect(formatSandboxError({ reason: "invalid input" })).toBe(
      '{\n  "reason": "invalid input"\n}',
    );
  });
});

describe("CodeMode execution", () => {
  it("stops a busy loop and allows the next execution to succeed", async () => {
    const result = await runInSandbox("while (true) {}", {}, { timeoutMs: 50 });
    expect(result).toMatchObject({ ok: false, error: { kind: "TimeoutExceeded" } });
    expect(await runInSandbox("return 42;", {})).toMatchObject({ ok: true, value: 42 });
  });

  it("times out while awaiting a host operation", async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const slow = vi.fn(() => pending);
    try {
      const result = await runInSandbox(
        "return await tools.siliconharbour.slow({});",
        { slow },
        { timeoutMs: 50 },
      );
      expect(slow).toHaveBeenCalledOnce();
      expect(result).toMatchObject({
        ok: false,
        error: { kind: "TimeoutExceeded" },
        toolCalls: [{ name: "siliconharbour.slow" }],
      });
    } finally {
      // The underlying Promise operation is not cancelled by Effect interruption.
      finish(null);
    }
  });

  it("limits calls before admitting further side effects and reports completed calls", async () => {
    const write = vi.fn(async () => ({ saved: true }));
    const result = await runInSandbox(
      "await tools.siliconharbour.write({}); await tools.siliconharbour.write({}); return await tools.siliconharbour.write({});",
      { write },
      { maxToolCalls: 2, timeoutMs: 1_000 },
    );
    expect(write).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "ToolCallLimitExceeded" },
      toolCalls: [{ name: "siliconharbour.write" }, { name: "siliconharbour.write" }],
    });
  });

  it("bounds result and log output and preserves the truncation signal", async () => {
    const result = await runInSandbox(
      'console.log("log".repeat(100)); return "value".repeat(100);',
      {},
      { maxOutputBytes: 64, timeoutMs: 1_000 },
    );
    expect(result).toMatchObject({ ok: true, truncated: true });
    if (result.ok) expect(JSON.stringify(result.value).length).toBeLessThan(500);
  });

  it("does not expose host failure messages or stacks", async () => {
    const result = await runInSandbox("return await tools.siliconharbour.fail({});", {
      fail: async () => {
        throw new Error("SECRET database credentials");
      },
    });
    expect(result).toMatchObject({ ok: false, error: { kind: "ToolFailure" } });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it.each([
    "return process.env;",
    "return await fetch('https://example.com');",
    "return eval('1');",
    "return ({}).constructor.constructor('return process')();",
    "return ({}).__proto__;",
    "import { events } from 'siliconharbour'; return events({});",
  ])("rejects ambient authority and unsupported modules: %s", async (code) => {
    expect((await runInSandbox(code, {})).ok).toBe(false);
  });

  it("executes independent calls in parallel and returns their values", async () => {
    let active = 0;
    let maximum = 0;
    const lookup = async (input: unknown) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return input;
    };
    const result = await runInSandbox(
      "return await Promise.all([tools.siliconharbour.lookup({ id: 1 }), tools.siliconharbour.lookup({ id: 2 })]);",
      { lookup },
    );
    expect(result).toMatchObject({ ok: true, value: [{ id: 1 }, { id: 2 }] });
    expect(maximum).toBe(2);
  });

  it("returns safe Zod validation failures that agents can act on", async () => {
    const result = await runInSandbox(
      "return await tools.siliconharbour.jobs({ limit: 'bad' });",
      buildReadFunctions(),
    );
    expect(result).toMatchObject({ ok: false, error: { kind: "ToolFailure" } });
    if (!result.ok) expect(result.error.message).toContain("limit");
  });

  it("discovers only the supplied tools and renders the host's actual input schemas", async () => {
    const read = buildReadFunctions();
    const write = buildExecuteFunctions();
    for (const fn of Object.values(write)) expect(fn.__inputSchema).toBeDefined();
    const catalog = createCodeMode(write).catalog();
    const create = catalog.find((entry) => entry.path === "siliconharbour.createEntity");
    expect(create?.signature).toContain('"person"');
    expect(create?.signature).toContain("bio: string");
    expect(create?.signature).toContain("Promise<unknown>");
    const result = await runInSandbox('return search({ query: "createEntity" });', read);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("siliconharbour.createEntity");
  });
});
