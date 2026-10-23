import { operationCatalog } from "~/operations/catalog";
import { publicContext, type OperationContext } from "~/operations/context";
import { OperationError } from "~/operations/errors";
import { PublicFetchError } from "~/lib/public-fetch.server";
import { ImageInputError } from "~/lib/image-input.server";
import { formatValidationError } from "~/operations/fields";
import { CodeMode, Tool, toolError } from "@opencode-ai/codemode";
import { Effect } from "effect";
import { z } from "zod";

import type { HostFunctions } from "./host-function";

export const QUERY_LIMITS = {
  timeoutMs: 10_000,
  maxToolCalls: 100,
  maxOutputBytes: 65_536,
} satisfies CodeMode.ExecutionLimits;

export const EXECUTE_LIMITS = { ...QUERY_LIMITS, timeoutMs: 60_000 };

export function createCodeMode(
  hostFns: HostFunctions,
  limits: CodeMode.ExecutionLimits = QUERY_LIMITS,
  context: OperationContext = publicContext(),
): CodeMode.Runtime {
  const tools = Object.fromEntries(
    Object.entries(hostFns).map(([name, fn]) => [
      name,
      Tool.make({
        description: fn.doc.description,
        // Code Mode types a subset of the JSON Schema that Zod emits.
        input: z.toJSONSchema(fn.inputSchema, {
          io: "input",
          unrepresentable: "any",
        }) as Tool.JsonSchema,
        output: fn.outputSchema
          ? (z.toJSONSchema(fn.outputSchema, {
              io: "output",
              unrepresentable: "any",
            }) as Tool.JsonSchema)
          : {},
        execute: (input) =>
          Effect.tryPromise({
            try: () => fn(input),
            catch: (error) =>
              error instanceof z.ZodError
                ? toolError(formatValidationError(error, fn.inputSchema, input))
                : error instanceof OperationError ||
                    error instanceof PublicFetchError ||
                    error instanceof ImageInputError
                  ? toolError(error.message)
                  : error,
          }),
      }),
    ]),
  );

  return CodeMode.make({
    tools: { siliconharbour: tools },
    limits,
    onUnknownTool(path) {
      const name = path.split(".").at(-1)!;
      const operation = Object.hasOwn(operationCatalog, name)
        ? operationCatalog[name as keyof typeof operationCatalog]
        : undefined;
      if (operation && !Object.hasOwn(hostFns, name)) {
        if (operation.access === "admin" && context.actor?.role !== "admin")
          return {
            message: `${name} requires administrator access${operation.risk === "read" ? "." : " and mcp:write. Use execute after authorization."}`,
          };
        if (operation.risk !== "read")
          return {
            message: `${name} is a write operation. Use the execute tool.${context.scopes.has("write") ? "" : " Authorize mcp:write first."}`,
          };
      }
      const suggestions = CodeMode.closestNames(name, Object.keys(hostFns));
      return suggestions.length
        ? {
            message: `Unknown tool '${path}'. Did you mean ${suggestions.join(", ")}?`,
            suggestions,
          }
        : undefined;
    },
  });
}
