import { mcpContext } from "~/operations/context";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { searchSpec } from "./search.js";
import { type CodeMode, searchSignature } from "@opencode-ai/codemode";
import { Effect } from "effect";
import { createCodeMode, QUERY_LIMITS, EXECUTE_LIMITS } from "./code-mode.js";
import { buildReadFunctions, buildExecuteFunctions } from "./bridge.js";

export function describeRuntime(
  runtime: CodeMode.Runtime,
  limits: typeof QUERY_LIMITS,
  functions: import("./host-function").HostFunctions,
): string {
  const catalog = runtime.catalog();
  const areas = new Map<string, number>();
  for (const fn of Object.values(functions))
    areas.set(fn.doc.category, (areas.get(fn.doc.category) ?? 0) + 1);
  const parts = [
    "Run confined JavaScript using tools.siliconharbour.<operation>(input), await calls, and return the fields you need.",
    "Each operation takes one object. Unknown fields, empty update patches, and invalid required values fail validation. Destructive and external operations require confirm: true.",
    "Use the MCP search tool for task discovery or a full operation schema. Inside the program, search({query}) discovers available runtime signatures.",
    searchSignature,
    "Imports, modules, eval, process, filesystem, fetch, timers, classes, and prototype access are unavailable. Await every started call; use Promise.all for independent work.",
    `Limits: ${limits.timeoutMs / 1000} seconds, ${limits.maxToolCalls} calls, ${limits.maxOutputBytes / 1024} KiB of results and logs. Narrow results or paginate to avoid truncation.`,
    "A failed execution may have completed earlier writes; inspect toolCalls before retrying. Read operations remain subject to administrator access and granted scopes.",
    `Areas: ${[...areas]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([area, count]) => `${area} (${count})`)
      .join(", ")}.`,
  ];
  let size = parts.join("\n").length;
  const common = [
    "eventPublicList",
    "jobPublicList",
    "companyPublicList",
    "personUpdate",
    "eventCreate",
    "newsUpdate",
  ];
  for (const name of common) {
    const tool = catalog.find((tool) => tool.path.split(".").at(-1) === name);
    if (!tool) continue;
    const entry = `${tool.signature}\n${functions[name].doc.description}`;
    if (size + entry.length + 1 > 8000) continue;
    parts.push(entry);
    size += entry.length + 1;
  }
  return parts.join("\n");
}

async function runCode(code: string, runtime: CodeMode.Runtime) {
  const result = await Effect.runPromise(runtime.execute(code));
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    isError: !result.ok,
  };
}

export async function createMcpServer(auth?: AuthInfo): Promise<McpServer> {
  const server = new McpServer({
    name: "siliconharbour",
    version: "2.0.0",
  });

  const context = mcpContext(auth);
  const readFunctions = buildReadFunctions(context);
  const queryRuntime = createCodeMode(readFunctions, QUERY_LIMITS);

  server.registerTool(
    "search",
    {
      title: "Search SiliconHarbour schema",
      description:
        "Find operations by task, area, name, or field. Search an exact operation name for its strict input schema and output shape. Results follow this session's permissions.",
      inputSchema: {
        query: z.string().describe("What to search for, e.g. 'event', 'job', 'company schema'"),
      },
    },
    async ({ query }) => ({
      content: [{ type: "text", text: searchSpec(query, context) }],
    }),
  );

  server.registerTool(
    "query",
    {
      title: "Query SiliconHarbour data",
      description: describeRuntime(queryRuntime, QUERY_LIMITS, readFunctions),
      inputSchema: {
        code: z
          .string()
          .describe(
            "JavaScript program calling tools.siliconharbour functions with one input object and returning the data you want. Example: return await tools.siliconharbour.eventPublicList({ upcoming: true, limit: 5 });",
          ),
      },
    },
    async ({ code }) => runCode(code, queryRuntime),
  );

  if (context.actor?.role === "admin" && context.scopes.has("write")) {
    const executeFunctions = buildExecuteFunctions(context);
    const executeRuntime = createCodeMode(executeFunctions, EXECUTE_LIMITS);
    server.registerTool(
      "execute",
      {
        title: "Execute authenticated SiliconHarbour actions",
        description: describeRuntime(executeRuntime, EXECUTE_LIMITS, executeFunctions),
        inputSchema: {
          code: z
            .string()
            .describe(
              "JavaScript program calling tools.siliconharbour functions with one input object. Use return for the result; await every started call.",
            ),
        },
      },
      async ({ code }) => runCode(code, executeRuntime),
    );
  }

  return server;
}
