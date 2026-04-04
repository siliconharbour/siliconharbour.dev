import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchSpec } from "./search.js";
import { runInSandbox } from "./sandbox.js";
import { buildReadFunctions, buildExecuteFunctions } from "./bridge.js";

export async function createMcpServer(authenticated = false): Promise<McpServer> {
  const server = new McpServer({
    name: "siliconharbour",
    version: "1.0.0",
  });

  // ── Tool 1: search ──────────────────────────────────────────────────
  server.registerTool(
    "search",
    {
      title: "Search SiliconHarbour schema",
      description:
        "Search the SiliconHarbour API schema to discover available data types and field shapes. " +
        "Call this first to learn what entities exist and what fields they have, then use 'query' to fetch data. " +
        "Example queries: 'event', 'job fields', 'company', 'what entities are available', 'siliconharbour module'.",
      inputSchema: {
        query: z.string().describe("What to search for, e.g. 'event', 'job', 'company schema'"),
      },
    },
    async ({ query }) => ({
      content: [{ type: "text", text: searchSpec(query) }],
    }),
  );

  // ── Tool 2: query ───────────────────────────────────────────────────
  server.registerTool(
    "query",
    {
      title: "Query SiliconHarbour data",
      description:
        "Execute JavaScript in a secure QuickJS sandbox to query SiliconHarbour community data. " +
        "Import from 'siliconharbour': events({ upcoming?, limit?, offset? }), jobs({ query?, limit?, offset? }), " +
        "companies({ query?, limit?, offset? }), groups({ limit?, offset? }), people({ query?, limit?, offset? }), " +
        "technologies({ limit?, offset? }), education({ limit?, offset? }). " +
        "Each function calls the real database on-demand — no pre-fetching. " +
        "Your code must export a default value. Use 'search' first to discover available fields. " +
        "Example: import { events } from 'siliconharbour'; export default await events({ upcoming: true, limit: 5 }) " +
        "Timeout: 10 seconds.",
      inputSchema: {
        code: z
          .string()
          .describe(
            "JavaScript module with 'export default' returning the data you want. " +
              "Can import functions from 'siliconharbour' — each call hits the real DB.",
          ),
      },
    },
    async ({ code }) => {
      try {
        const result = await runInSandbox(code, buildReadFunctions(), 10_000);
        if (result.ok) {
          return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
        }
        return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  // ── Tool 3: execute (authenticated sessions only) ───────────────────
  if (authenticated) server.registerTool(
    "execute",
    {
      title: "Execute authenticated SiliconHarbour actions",
      description:
        "Like 'query' but also exposes sync and pending-review functions. Requires apiToken. " +
        "Additional imports from 'siliconharbour': eventImportSources(), jobImportSources(), " +
        "pendingEvents(), pendingJobs(), syncEventSource(id), syncAllEventSources(), " +
        "syncJobSource(id), syncAllJobSources(). " +
        "All functions call the real database on-demand. " +
        "Timeout: 60 seconds. If sync times out, use pendingEvents/pendingJobs instead.",
      inputSchema: {
        code: z
          .string()
          .describe(
            "JavaScript module with 'export default'. Can import any siliconharbour function.",
          ),
        apiToken: z.string().describe("Bearer token matching MCP_API_TOKEN env var"),
      },
    },
    async ({ code, apiToken }) => {
      if (!process.env.MCP_API_TOKEN || apiToken !== process.env.MCP_API_TOKEN) {
        return {
          content: [{ type: "text", text: "Error: Invalid or missing apiToken" }],
          isError: true,
        };
      }
      try {
        const result = await runInSandbox(code, buildExecuteFunctions(), 60_000);
        if (result.ok) {
          return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
        }
        return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}
