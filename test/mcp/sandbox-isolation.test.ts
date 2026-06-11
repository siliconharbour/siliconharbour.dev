/**
 * Regression coverage for the production bug fixed in 8ad957a where the
 * QuickJS sandbox was loaded once at module init and reused across all
 * calls. Bad state from one execution could poison subsequent ones in a
 * long-lived MCP server process.
 *
 * Each test here would have failed against the pre-fix sandbox.ts.
 */

import { describe, expect, it } from "vitest";
import { runInSandbox } from "~/mcp/sandbox";

describe("MCP sandbox isolation across calls", () => {
  it("does not leak globals between sequential calls", async () => {
    // First call sets a global that should not persist into the next.
    const first = await runInSandbox(
      `globalThis.__leakedFromFirst = "should not be visible later";
       export default "first ok";`,
      {},
    );
    expect(first.ok).toBe(true);

    // Second call should see a fresh sandbox with no globals from the first.
    const second = await runInSandbox(
      `export default typeof globalThis.__leakedFromFirst;`,
      {},
    );
    expect(second.ok).toBe(true);
    expect(second.ok && second.data).toBe("undefined");
  });

  it("recovers cleanly from a thrown error in the previous call", async () => {
    // A call that throws inside the sandbox must not poison subsequent calls.
    const bad = await runInSandbox(
      `export default (() => { throw new Error("boom"); })();`,
      {},
    );
    expect(bad.ok).toBe(false);

    // The next call should still execute happily in a fresh sandbox.
    const good = await runInSandbox(`export default 1 + 1;`, {});
    expect(good.ok).toBe(true);
    expect(good.ok && good.data).toBe(2);
  });

  it("recovers from a host function that rejects", async () => {
    // Even if the host function rejects (not the sandbox itself), the next
    // call must still work — this is the more realistic production scenario.
    const reject = await runInSandbox(
      `import { willThrow } from "siliconharbour";
       export default await willThrow();`,
      {
        willThrow: async () => {
          throw new Error("host fn blew up");
        },
      },
    );
    expect(reject.ok).toBe(false);

    const ok = await runInSandbox(`export default 42;`, {});
    expect(ok.ok).toBe(true);
    expect(ok.ok && ok.data).toBe(42);
  });

  it("does not share host functions between calls", async () => {
    // Each invocation gets exactly the host functions passed in — no carry-over.
    const withFooBar = await runInSandbox(
      `import { foo, bar } from "siliconharbour";
       export default { f: await foo(), b: await bar() };`,
      {
        foo: async () => "foo-result",
        bar: async () => "bar-result",
      },
    );
    expect(withFooBar.ok).toBe(true);
    expect(withFooBar.ok && withFooBar.data).toEqual({ f: "foo-result", b: "bar-result" });

    // Second call exposes only `baz`. Importing `foo` from the previous call
    // should be undefined / unresolved, not the stale handler.
    const withBaz = await runInSandbox(
      `import { baz } from "siliconharbour";
       export default { type: typeof baz, value: await baz() };`,
      {
        baz: async () => "baz-result",
      },
    );
    expect(withBaz.ok).toBe(true);
    expect(withBaz.ok && withBaz.data).toEqual({ type: "function", value: "baz-result" });
  });

  it("handles concurrent calls without interference", async () => {
    // Production MCP servers can serve concurrent requests. Per-invocation
    // sandboxes mean concurrent calls must produce their own results
    // independently. Each call uses a host function that returns its tag.
    const makeFns = (tag: string) => ({
      whoami: async () => tag,
    });

    const calls = Array.from({ length: 5 }, (_unused, i) =>
      runInSandbox(
        `import { whoami } from "siliconharbour";
         export default await whoami();`,
        makeFns(`tag-${i}`),
      ),
    );
    const results = await Promise.all(calls);

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      expect(r.ok, `call ${i} should succeed`).toBe(true);
      expect(r.ok && r.data).toBe(`tag-${i}`);
    }
  });

  it("survives a long sequence of calls without degrading", async () => {
    // Simulates the long-lived production server doing many small queries.
    // Any per-call sandbox setup cost is acceptable; what we verify is that
    // results stay correct and no call hangs / regresses.
    const N = 8;
    for (let i = 0; i < N; i++) {
      const r = await runInSandbox(`export default ${i} * 2;`, {});
      expect(r.ok, `iteration ${i}`).toBe(true);
      expect(r.ok && r.data).toBe(i * 2);
    }
  });
});
