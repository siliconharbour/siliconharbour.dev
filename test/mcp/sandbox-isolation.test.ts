import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { createCodeMode, runInSandbox } from "~/mcp/sandbox";

describe("CodeMode isolation across calls", () => {
  it("does not leak variables between executions of a reused runtime", async () => {
    const runtime = createCodeMode({});
    const first = await Effect.runPromise(
      runtime.execute('const leaked = "first"; return leaked;'),
    );
    expect(first).toMatchObject({ ok: true, value: "first" });
    const second = await Effect.runPromise(runtime.execute("return leaked;"));
    expect(second).toMatchObject({ ok: false, error: { kind: "ExecutionFailure" } });
  });

  it("recovers cleanly from a thrown error in the previous call", async () => {
    const runtime = createCodeMode({});
    const bad = await Effect.runPromise(
      runtime.execute(`return (() => { throw new Error("boom"); })();`),
    );
    expect(bad.ok).toBe(false);

    const good = await Effect.runPromise(runtime.execute(`return 1 + 1;`));
    expect(good.ok).toBe(true);
    expect(good.ok && good.value).toBe(2);
  });

  it("recovers from a host function that rejects", async () => {
    const runtime = createCodeMode({
      willThrow: async () => {
        throw new Error("host fn blew up");
      },
    });
    const reject = await Effect.runPromise(
      runtime.execute(`return await tools.siliconharbour.willThrow({});`),
    );
    expect(reject.ok).toBe(false);

    const ok = await Effect.runPromise(runtime.execute(`return 42;`));
    expect(ok.ok).toBe(true);
    expect(ok.ok && ok.value).toBe(42);
  });

  it("does not share host functions between calls", async () => {
    const withFooBar = await runInSandbox(
      `return { f: await tools.siliconharbour.foo({}), b: await tools.siliconharbour.bar({}) };`,
      {
        foo: async () => "foo-result",
        bar: async () => "bar-result",
      },
    );
    expect(withFooBar.ok).toBe(true);
    expect(withFooBar.ok && withFooBar.value).toEqual({ f: "foo-result", b: "bar-result" });

    const withBaz = await runInSandbox(`return await tools.siliconharbour.baz({});`, {
      baz: async () => "baz-result",
    });
    expect(withBaz.ok).toBe(true);
    expect(withBaz.ok && withBaz.value).toBe("baz-result");
    const missing = await runInSandbox("return await tools.siliconharbour.foo({});", {
      baz: async () => "baz",
    });
    expect(missing).toMatchObject({ ok: false, error: { kind: "UnknownTool" } });
  });

  it("handles concurrent calls without interference", async () => {
    const runtime = createCodeMode({ whoami: async (input) => input });
    const calls = Array.from({ length: 5 }, (_unused, i) =>
      Effect.runPromise(
        runtime.execute(
          `const tag = "tag-${i}"; return await tools.siliconharbour.whoami({ tag });`,
        ),
      ),
    );
    const results = await Promise.all(calls);

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      expect(r.ok, `call ${i} should succeed`).toBe(true);
      expect(r.ok && r.value).toEqual({ tag: `tag-${i}` });
    }
  });

  it("survives a long sequence of calls without degrading", async () => {
    const runtime = createCodeMode({});
    const N = 8;
    for (let i = 0; i < N; i++) {
      const r = await Effect.runPromise(runtime.execute(`return ${i} * 2;`));
      expect(r.ok, `iteration ${i}`).toBe(true);
      expect(r.ok && r.value).toBe(i * 2);
    }
  });
});
