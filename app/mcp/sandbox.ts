import asyncVariant from "@jitl/quickjs-ng-wasmfile-release-asyncify";
import { loadAsyncQuickJs, expose } from "@sebastianwessel/quickjs";

// Load QuickJS async WASM once at module init — resource intensive
const { runSandboxed } = await loadAsyncQuickJs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  asyncVariant as any,
);

/**
 * Host functions exposed inside the sandbox as globalThis.siliconharbour.
 * Each function is called on-demand by the user's code — no pre-fetching.
 */
export type HostFunctions = Record<string, (...args: unknown[]) => Promise<unknown>>;

/**
 * Convert arbitrary thrown/reported values into useful MCP error text.
 *
 * QuickJS can surface structured objects instead of native Error instances;
 * String(object) turns those into the unhelpful "[object Object]". Keep as much
 * detail as possible so MCP clients show the real failure.
 */
export function formatSandboxError(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message;
  if (typeof err === "string") return err;
  if (err == null) return "Unknown error";

  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    const parts = [record.name, record.message, record.stack, record.code]
      .filter((value): value is string | number =>
        typeof value === "string" || typeof value === "number",
      )
      .map(String)
      .filter(Boolean);
    if (parts.length > 0) return parts.join("\n");

    try {
      const json = JSON.stringify(err, null, 2);
      if (json && json !== "{}") return json;
    } catch {
      // Fall through to the final conversion.
    }
  }

  return String(err);
}

/**
 * Runs user-supplied JS code in a QuickJS async WASM sandbox.
 *
 * Host functions are exposed via the `expose()` bridge as globalThis.siliconharbour —
 * the same pattern Cloudflare uses with their Proxy-based dispatch. Each function
 * call in user code crosses the WASM boundary to the real host function, runs on
 * the host, and returns the result. No pre-fetching.
 *
 * The siliconharbour virtual module re-exports from globalThis.siliconharbour so
 * user code can `import { events } from 'siliconharbour'` naturally.
 *
 * @param code - User JS module with `export default`
 * @param hostFns - Host functions to expose as the siliconharbour API
 * @param timeoutMs - Kill the sandbox after this many ms
 */
export async function runInSandbox(
  code: string,
  hostFns: HostFunctions,
  timeoutMs = 5_000,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  // Wrap bare async arrow functions in export default
  const wrappedCode =
    code.trim().startsWith("async") && !code.includes("export default")
      ? `export default await (${code.trim()})()`
      : code;

  // The virtual module re-exports each function from the host-exposed global.
  // expose() bridges the host async functions into QuickJS — calls return Promises
  // that resolve via executePendingJobs polling in the async event loop.
  const moduleExports = Object.keys(hostFns)
    .map(
      (k) =>
        `export async function ${k}(...args) { return await globalThis.__sh__.${k}(...args); }`,
    )
    .join("\n");

  try {
    const result = await runSandboxed(
      async ({ ctx, evalCode }) => {
        // Inject host functions as globalThis.__sh__ via expose()
        expose(ctx, {} as never, { __sh__: hostFns });
        return evalCode(wrappedCode);
      },
      {
        allowFetch: false,
        allowFs: false,
        executionTimeout: timeoutMs,
        nodeModules: {
          siliconharbour: {
            "index.js": moduleExports,
          },
        },
      },
    );

    if (result.ok) {
      return { ok: true, data: result.data };
    }
    return { ok: false, error: formatSandboxError((result as { error: unknown }).error) };
  } catch (err) {
    return { ok: false, error: formatSandboxError(err) };
  }
}
