import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { searchSpec } from "./search.js";
import { type CodeMode, searchSignature } from "@opencode-ai/codemode";
import { Effect } from "effect";
import { createCodeMode, QUERY_LIMITS, EXECUTE_LIMITS } from "./code-mode.js";
import { buildReadFunctions, buildExecuteFunctions } from "./bridge.js";

function describeRuntime(runtime: CodeMode.Runtime, limits: typeof QUERY_LIMITS): string {
  const catalog = runtime.catalog();
  const entries: string[] = [];
  let characters = 0;
  for (const tool of [...catalog].sort((a, b) => a.signature.length - b.signature.length)) {
    const entry = `${tool.signature}\n  ${tool.description}`;
    if (characters + entry.length > 8_000) continue;
    entries.push(entry);
    characters += entry.length;
  }

  return [
    "Run a confined JavaScript orchestration script to access SiliconHarbour tools. Call tools.siliconharbour.<function>(input) and return the fields you need.",
    "Each tool takes one input object; use {} for tools with no parameters. Inputs are validated by the host's Zod schemas.",
    "Use await and try/catch for tool calls. Use Promise.all for independent calls. Await every started call before returning.",
    "Imports, export default, eval, modules, process, filesystem, fetch, timers, classes, and prototype access are unavailable.",
    "Use the MCP search tool for entity field details. Inside this program, search({ query }) discovers tool signatures; it is distinct from the MCP search tool. Search for a function name when its signature is not shown below.",
    searchSignature,
    "Tool results have unknown shapes: inspect and narrow them before accessing fields. Filter and aggregate results in code.",
    `Limits: ${limits.timeoutMs / 1_000} seconds, ${limits.maxToolCalls} tool calls, ${limits.maxOutputBytes / 1_024} KiB of result and logs. Output may be truncated; narrow results or paginate.`,
    "Returns JSON with ok, value or error, toolCalls, and optional logs, warnings, and truncated. A failed execution may have completed earlier writes; inspect toolCalls before retrying.",
    "",
    `Available tools (${catalog.length} total): ${catalog.map((tool) => tool.path).join(", ")}`,
    `Inline signatures (${entries.length} of ${catalog.length} shown; use search for the rest):`,
    ...entries,
  ].join("\n");
}

async function runCode(code: string, runtime: CodeMode.Runtime) {
  const result = await Effect.runPromise(runtime.execute(code));
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    isError: !result.ok,
  };
}

function buildExecuteDescription(runtime: CodeMode.Runtime): string {
  return [
    "Requires the mcp:write OAuth scope. Exposes read, sync, creation, and review functions.",
    describeRuntime(runtime, EXECUTE_LIMITS),
    "",
    "JOB REVIEW CRITERIA:",
    "- 'approve' if: technical role (software, engineering, data, design, product, DevOps, QA, security, AI/ML) AND located in St. John's NL or remote in Canada.",
    "- 'approve-non-technical' if: non-technical role (sales, marketing, HR, operations, finance, admin) BUT in St. John's NL or remote. Also use for remote technical roles that are clearly not NL-connected.",
    "- 'hide' if: not in St. John's/NL and not remote, OR completely irrelevant to the NL tech community.",
    "- Some companies (Canadian Blood Services, PAL Aerospace, PAL Airlines) have high volumes of non-technical/non-NL roles — default to 'hide' unless clearly St. John's tech.",
    "When uncertain, lean toward 'approve-non-technical' over 'hide'.",
    "",
    "For long imports prefer tools.siliconharbour.asyncSyncAllSources({}) and poll tools.siliconharbour.getAsyncSync({ runId }).",
  ].join("\n");
}

export async function createMcpServer(authenticated = false): Promise<McpServer> {
  const server = new McpServer({
    name: "siliconharbour",
    version: "2.0.0",
  });

  const queryRuntime = createCodeMode(buildReadFunctions(), QUERY_LIMITS);

  server.registerTool(
    "search",
    {
      title: "Search SiliconHarbour schema",
      description:
        "Search the SiliconHarbour API schema to discover available data types and field shapes. " +
        "Call this first to learn what entities exist and what fields they have, then use 'query' to fetch data. " +
        "Example queries: 'event', 'job fields', 'company', 'what entities are available', 'siliconharbour tools'.",
      inputSchema: {
        query: z.string().describe("What to search for, e.g. 'event', 'job', 'company schema'"),
      },
    },
    async ({ query }) => ({
      content: [{ type: "text", text: searchSpec(query) }],
    }),
  );

  server.registerTool(
    "query",
    {
      title: "Query SiliconHarbour data",
      description: describeRuntime(queryRuntime, QUERY_LIMITS),
      inputSchema: {
        code: z
          .string()
          .describe(
            "JavaScript program calling tools.siliconharbour functions with one input object and returning the data you want. Example: return await tools.siliconharbour.events({ upcoming: true, limit: 5 });",
          ),
      },
    },
    async ({ code }) => runCode(code, queryRuntime),
  );

  if (authenticated) {
    const executeRuntime = createCodeMode(buildExecuteFunctions(), EXECUTE_LIMITS);
    server.registerTool(
      "execute",
      {
        title: "Execute authenticated SiliconHarbour actions",
        description: buildExecuteDescription(executeRuntime),
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
