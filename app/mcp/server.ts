import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchSpec } from "./search.js";
import { formatSandboxError, runInSandbox } from "./sandbox.js";
import type { HostFunctions } from "./sandbox.js";
import {
  buildReadFunctions,
  buildExecuteFunctions,
  getHostFunctionDocs,
  getEntitySchemaDocs,
  type HostFnCategory,
  type HostFunctionDocsEntry,
  type UnionSchemaDoc,
} from "./bridge.js";

// ── Shared sandbox result handler ──────────────────────────────────────

async function runSandboxTool(code: string, fns: HostFunctions, timeout: number) {
  try {
    const result = await runInSandbox(code, fns, timeout);
    if (result.ok) {
      return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
    }
    return { content: [{ type: "text" as const, text: `Error: ${result.error}` }], isError: true };
  } catch (err) {
    return {
      content: [
        { type: "text" as const, text: `Error: ${formatSandboxError(err)}` },
      ],
      isError: true,
    };
  }
}

// ── Tool descriptions ──────────────────────────────────────────────────

// Render order for categories in the auto-generated tool descriptions.
const CATEGORY_ORDER: HostFnCategory[] = [
  "read",
  "sources",
  "sync",
  "async-sync",
  "creation",
  "lookup",
  "search",
  "lifecycle",
];

const CATEGORY_LABELS: Record<HostFnCategory, string> = {
  read: "Read",
  sources: "Import sources",
  sync: "Synchronous sync",
  "async-sync": "Background sync",
  creation: "Creation",
  lookup: "Lookup / detail",
  search: "External search",
  lifecycle: "Lifecycle / review",
};

function groupByCategory(entries: HostFunctionDocsEntry[]) {
  const byCat = new Map<HostFnCategory, HostFunctionDocsEntry[]>();
  for (const entry of entries) {
    const arr = byCat.get(entry.category) ?? [];
    arr.push(entry);
    byCat.set(entry.category, arr);
  }
  return byCat;
}

/**
 * Verbose renderer — emits signature + description per function. Used
 * for the `query` tool which only exposes the small read surface, so
 * the prompt cost stays bounded.
 */
function describeEntriesVerbose(entries: HostFunctionDocsEntry[]): string {
  const byCat = groupByCategory(entries);
  return CATEGORY_ORDER.filter((cat) => byCat.has(cat))
    .map((cat) => {
      const items = byCat.get(cat) ?? [];
      const lines = items.map((e) => `- ${e.signature}\n  ${e.description}`).join("\n");
      return `${CATEGORY_LABELS[cat]}:\n${lines}`;
    })
    .join("\n\n");
}

/**
 * Terse renderer — emits category-grouped name-only lists. Used for the
 * `execute` tool which exposes 50+ functions; the agent gets a fast
 * inventory of what's available, and can call the `search` tool with a
 * function name to retrieve the full signature and description on
 * demand (searchSpec already cross-references getHostFunctionDocs()).
 */
function describeEntriesTerse(entries: HostFunctionDocsEntry[]): string {
  const byCat = groupByCategory(entries);
  return CATEGORY_ORDER.filter((cat) => byCat.has(cat))
    .map((cat) => {
      const items = byCat.get(cat) ?? [];
      const names = items.map((e) => e.name).join(", ");
      return `${CATEGORY_LABELS[cat]}: ${names}`;
    })
    .join("\n");
}

/**
 * Render the per-variant field docs for the discriminated-union host
 * functions (createEntity, updateEntity, reviewEntity). Each variant
 * gets one line listing required and optional fields with their types.
 * Sourced from getEntitySchemaDocs() so the prompt and the search tool
 * can never disagree on what fields a variant accepts.
 */
function describeEntitySchemas(unions: UnionSchemaDoc[]): string {
  const renderField = (f: { name: string; type: string }) => {
    // Quote string-literal enums for clarity; bare names for primitives.
    return `${f.name}: ${f.type}`;
  };

  return unions
    .map((u) => {
      const lines = u.variants.map((v) => {
        const req = v.required.length
          ? `required ${v.required.map(renderField).join(", ")}`
          : "";
        const opt = v.optional.length
          ? `optional ${v.optional.map(renderField).join(", ")}`
          : "";
        const parts = [req, opt].filter(Boolean).join("; ");
        return `  - ${v.type}: ${parts || "no fields"}`;
      });
      return `${u.unionName} variants:\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

function buildQueryDescription(): string {
  const docs = getHostFunctionDocs();
  return [
    "Execute JavaScript in a secure QuickJS sandbox to query SiliconHarbour community data.",
    "Each function calls the real database on-demand — no pre-fetching.",
    "Your code must export a default value. Use 'search' first to discover available fields.",
    "Example: import { events } from 'siliconharbour'; export default await events({ upcoming: true, limit: 5 })",
    "Timeout: 10 seconds.",
    "",
    "Imports from 'siliconharbour':",
    "",
    describeEntriesVerbose(docs.read),
  ].join("\n");
}

function buildExecuteDescription(): string {
  const docs = getHostFunctionDocs();
  const unions = getEntitySchemaDocs();
  return [
    "Like 'query' but also exposes sync, creation, review functions. Requires apiToken.",
    "",
    "Imports from 'siliconharbour' (call search('fnName') for signatures):",
    "",
    describeEntriesTerse(docs.execute),
    "",
    describeEntitySchemas(unions),
    "",
    "JOB REVIEW CRITERIA:",
    "- 'approve' if: technical role (software, engineering, data, design, product, DevOps, QA, security, AI/ML) AND located in St. John's NL or remote in Canada.",
    "- 'approve-non-technical' if: non-technical role (sales, marketing, HR, operations, finance, admin) BUT in St. John's NL or remote. Also use for remote technical roles that are clearly not NL-connected.",
    "- 'hide' if: not in St. John's/NL and not remote, OR completely irrelevant to the NL tech community.",
    "- Some companies (Canadian Blood Services, PAL Aerospace, PAL Airlines) have high volumes of non-technical/non-NL roles — default to 'hide' unless clearly St. John's tech.",
    "When uncertain, lean toward 'approve-non-technical' over 'hide'.",
    "",
    "All functions hit the real DB on-demand. Timeout: 60s. For long imports prefer asyncSyncAllSources() and poll getAsyncSync(runId).",
  ].join("\n");
}

// ── Server factory ─────────────────────────────────────────────────────

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
      description: buildQueryDescription(),
      inputSchema: {
        code: z
          .string()
          .describe(
            "JavaScript module with 'export default' returning the data you want. " +
              "Can import functions from 'siliconharbour' — each call hits the real DB.",
          ),
      },
    },
    async ({ code }) => runSandboxTool(code, buildReadFunctions(), 10_000),
  );

  // ── Tool 3: execute (authenticated sessions only) ───────────────────
  if (authenticated)
    server.registerTool(
      "execute",
      {
        title: "Execute authenticated SiliconHarbour actions",
        description: buildExecuteDescription(),
        inputSchema: {
          code: z
            .string()
            .describe(
              "JavaScript module with 'export default'. Can import any siliconharbour function.",
            ),
        },
      },
      async ({ code }) => runSandboxTool(code, buildExecuteFunctions(), 60_000),
    );

  return server;
}
