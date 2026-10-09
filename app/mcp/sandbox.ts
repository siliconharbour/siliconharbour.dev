import { CodeMode, Tool, toolError } from "@opencode-ai/codemode";
import { Effect } from "effect";
import { z } from "zod";

export type HostFunctions = Record<
  string,
  ((...args: unknown[]) => Promise<unknown>) & {
    __doc?: { description: string };
    __inputSchema?: z.ZodType;
  }
>;

export const QUERY_LIMITS = {
  timeoutMs: 10_000,
  maxToolCalls: 100,
  maxOutputBytes: 65_536,
} satisfies CodeMode.ExecutionLimits;

export const EXECUTE_LIMITS = { ...QUERY_LIMITS, timeoutMs: 60_000 };

export function formatSandboxError(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message;
  if (typeof err === "string") return err;
  if (err == null) return "Unknown error";

  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    const parts = [record.name, record.message, record.stack, record.code]
      .filter(
        (value): value is string | number => typeof value === "string" || typeof value === "number",
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

export function createCodeMode(
  hostFns: HostFunctions,
  limits: CodeMode.ExecutionLimits = QUERY_LIMITS,
): CodeMode.Runtime {
  const tools = Object.fromEntries(
    Object.entries(hostFns).map(([name, fn]) => [
      name,
      Tool.make({
        description: fn.__doc?.description ?? name,
        input: fn.__inputSchema
          ? z.toJSONSchema(fn.__inputSchema, { io: "input", unrepresentable: "any" })
          : {},
        // The published package treats tools without an output schema as void.
        output: {},
        execute: (input) =>
          Effect.tryPromise({
            try: () => fn(input),
            catch: (error) =>
              error instanceof z.ZodError
                ? toolError(
                    error.issues
                      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
                      .join("; "),
                  )
                : error,
          }),
      }),
    ]),
  );

  return CodeMode.make({ tools: { siliconharbour: tools }, limits });
}

export function runInSandbox(
  code: string,
  hostFns: HostFunctions,
  limits: CodeMode.ExecutionLimits = QUERY_LIMITS,
): Promise<CodeMode.Result> {
  return Effect.runPromise(createCodeMode(hostFns, limits).execute(code));
}
