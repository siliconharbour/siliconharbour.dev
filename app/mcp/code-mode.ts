import { OperationError } from "~/operations/errors";
import { PublicFetchError } from "~/lib/public-fetch.server";
import { ImageInputError } from "~/lib/image-input.server";
import { formatValidationError } from "~/operations/fields";
import { CodeMode, Tool, toolError } from "@opencode-ai/codemode";
import { Effect } from "effect";
import { z } from "zod";

import type { HostFunctions } from "./bridge.js";

export const QUERY_LIMITS = {
  timeoutMs: 10_000,
  maxToolCalls: 100,
  maxOutputBytes: 65_536,
} satisfies CodeMode.ExecutionLimits;

export const EXECUTE_LIMITS = { ...QUERY_LIMITS, timeoutMs: 60_000 };

export function createCodeMode(
  hostFns: HostFunctions,
  limits: CodeMode.ExecutionLimits = QUERY_LIMITS,
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
        // Tools without an output schema return void.
        output: {},
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

  return CodeMode.make({ tools: { siliconharbour: tools }, limits });
}
