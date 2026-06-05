import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchSpec } from "./search.js";
import { formatSandboxError, runInSandbox } from "./sandbox.js";
import type { HostFunctions } from "./sandbox.js";
import { buildReadFunctions, buildExecuteFunctions } from "./bridge.js";

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

const EXECUTE_DESCRIPTION = [
  "Like 'query' but also exposes sync, creation, review, and pending functions.",
  "Requires apiToken.",
  "",
  "Additional imports from 'siliconharbour':",
  "- eventImportSources(), jobImportSources(), pendingEvents(), pendingJobs()",
  "- syncEventSource(id), syncAllEventSources(), syncJobSource(id), syncAllJobSources()",
  "- createCompany({ name, website?, description?, location?, email? })",
  "- getCompanyByName(name)",
  "- updateCompany({ id, name?, website?, description?, location?, email?, linkedin?, github?, wikipedia?, careersUrl?, founded?, visible?, technl?, genesis?, bounce? })",
  "- createJobSource({ companyId, sourceType, sourceIdentifier, sourceUrl? })",
  "- updateJobSource({ sourceId, sourceType?, sourceIdentifier?, sourceUrl? })",
  "- createEventSource({ name, sourceType, sourceIdentifier, sourceUrl, organizer? })",
  "- listImporterTypes()",
  "- getJobDetail(jobId)",
  "- reviewJob({ jobId, action })",
  "- createJob({ title, description, url, companyName?, companyId?, location?, department?, workplaceType?, salaryRange?, isTechnical? })",
  "- updateJob({ id, title?, description?, url?, location?, department?, workplaceType?, salaryRange? })",
  "- getManualJobs()",
  "- deactivateJob({ jobId, reason }) where reason is 'removed', 'filled', or 'expired'",
  "- searchIndeedJobs({ query?, location?, limit?, hoursOld? })",
  "- searchLinkedInJobs({ query?, location?, limit? })",
  "- submitNewsLink({ url, title?, excerpt?, sourceName? })",
  "- createNewsArticle({ title, content, excerpt?, publish? })",
  "- pendingNews()",
  "- approveNews(id)",
  "- hideNews(id)",
  "",
  "createCompany creates hidden companies (pending review).",
  "createJob creates a manual job posting (active immediately). Pass companyName to auto-resolve the company ID.",
  "getManualJobs() returns all active manually-created jobs with their URLs for liveness checking.",
  "deactivateJob marks a job as removed/filled/expired (use for manual jobs whose links have gone dead).",
  "createJobSource/createEventSource validate the config before saving.",
  "pendingJobs() returns title, company, location, workplaceType, descriptionSnippet, URL.",
  "getJobDetail(jobId) returns full description text for deeper analysis.",
  "",
  "reviewJob actions: 'approve' (technical job, published),",
  "'approve-non-technical' (non-technical job, published but deprioritized),",
  "'hide' (not relevant, hidden from public).",
  "",
  "JOB REVIEW CRITERIA:",
  "- 'approve' if: technical role (software, engineering, data, design, product, DevOps, QA, security, AI/ML) AND located in St. John's NL or remote in Canada.",
  "- 'approve-non-technical' if: non-technical role (sales, marketing, HR, operations, finance, admin) BUT in St. John's NL or remote. Also use for remote technical roles that are clearly not NL-connected.",
  "- 'hide' if: not in St. John's/NL and not remote, OR completely irrelevant to the NL tech community.",
  "- Some companies (Canadian Blood Services, PAL Aerospace, PAL Airlines) have high volumes of non-technical/non-NL roles — default to 'hide' unless clearly St. John's tech.",
  "When uncertain, lean toward 'approve-non-technical' over 'hide'.",
  "",
  "All functions call the real database on-demand.",
  "Timeout: 60 seconds. If sync times out, use pendingEvents/pendingJobs instead.",
].join("\n");

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
    async ({ code }) => runSandboxTool(code, buildReadFunctions(), 10_000),
  );

  // ── Tool 3: execute (authenticated sessions only) ───────────────────
  if (authenticated)
    server.registerTool(
      "execute",
      {
        title: "Execute authenticated SiliconHarbour actions",
        description: EXECUTE_DESCRIPTION,
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
