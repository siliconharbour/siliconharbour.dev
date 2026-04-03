# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount an MCP server at `/mcp` in a custom Express server alongside the React Router app, exposing 3 tools (`search`, `query`, `execute`) for AI clients to query all SiliconHarbour data and trigger import syncs.

**Architecture:** Replace `react-router-serve` with a custom Express `server.ts` that handles `/mcp` via the MCP SDK and forwards everything else to React Router. The `query` and `execute` tools run user-supplied JS in a QuickJS WASM sandbox with a `siliconharbour` virtual module injected — host DB functions are bridged in via `globalThis.__sh__`. `execute` additionally requires a Bearer token and exposes sync action functions.

**Tech Stack:** `@modelcontextprotocol/sdk@1.29.0`, `express`, `@types/express`, `@sebastianwessel/quickjs@3.0.1`, `@jitl/quickjs-ng-wasmfile-release-sync@0.32.0`, `zod` (already installed), `tsx@4.21.0` (already installed).

---

## File Map

**New files:**
- `server.ts` — custom Express server (project root)
- `app/mcp/server.ts` — MCP server instance + 3 tool registrations
- `app/mcp/search.ts` — `search` tool: openapi.json filter logic
- `app/mcp/sandbox.ts` — QuickJS setup, `runInSandbox()` wrapper
- `app/mcp/modules/siliconharbour-read.ts` — builds the read-only module JS string
- `app/mcp/modules/siliconharbour-execute.ts` — builds the read+write module JS string

**Modified files:**
- `package.json` — scripts + new deps
- `Dockerfile` — update CMD

---

## Task 1: Install dependencies + update scripts

**Files:**
- Modify: `package.json`
- Modify: `Dockerfile`

- [ ] **Step 1: Install new packages**

```bash
pnpm add @modelcontextprotocol/sdk express @sebastianwessel/quickjs @jitl/quickjs-ng-wasmfile-release-sync
pnpm add -D @types/express
```

Expected: packages added to `node_modules` and `pnpm-lock.yaml` updated.

- [ ] **Step 2: Update scripts in `package.json`**

Read `package.json` first. Replace the `dev` and `start` scripts:

```json
"dev": "tsx watch server.ts",
"start": "NODE_ENV=production tsx server.ts"
```

The `build` script stays unchanged (`react-router build`).

- [ ] **Step 3: Update Dockerfile CMD**

Read `Dockerfile`. Find the last line:
```
CMD ["pnpm", "run", "start"]
```
This already runs `pnpm run start` — no change needed since `start` now runs `tsx server.ts`. However, `tsx` must be available in the production image. Check that `tsx` is in `dependencies` (not just `devDependencies`) in `package.json` — it already is (`"tsx": "^4.21.0"` in dependencies). The production image runs `pnpm install --prod` which will include it.

Also ensure `server.ts` is copied into the image. The current Dockerfile copies `build/` but not the root `server.ts`. Add a COPY step in the final stage:

Find the final `FROM pnpm-base` stage and add before `WORKDIR /app`:
```dockerfile
COPY server.ts /app/server.ts
```

- [ ] **Step 4: Verify build still works**

```bash
pnpm run build
```

Expected: React Router build completes successfully. `build/server/index.js` exists.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml Dockerfile
git commit -m "feat: add MCP server dependencies and update scripts"
```

---

## Task 2: Custom Express server (`server.ts`)

**Files:**
- Create: `server.ts` (project root)

This replaces `react-router-serve`. It mounts the MCP SDK at `/mcp` and forwards everything else to React Router's request handler.

- [ ] **Step 1: Check latest MCP SDK import paths with Context7**

Before writing code, confirm the exact import paths for the current SDK version (1.29.0). Run:

```bash
npx @modelcontextprotocol/inspector --version 2>/dev/null || true
node -e "const s = require('./node_modules/@modelcontextprotocol/sdk/package.json'); console.log(Object.keys(s.exports || {}).slice(0,10))"
```

The v1 SDK (`@modelcontextprotocol/sdk`) should have these paths:
- `@modelcontextprotocol/sdk/server/mcp.js` → `McpServer`
- `@modelcontextprotocol/sdk/server/streamableHttp.js` → `StreamableHTTPServerTransport`
- `@modelcontextprotocol/sdk/types.js` → `isInitializeRequest`

If these differ, adjust the imports in the next step accordingly.

- [ ] **Step 2: Create `server.ts`**

```typescript
import express from "express";
import { createRequestHandler } from "@react-router/express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./app/mcp/server.js";

const app = express();

// ── MCP endpoint ─────────────────────────────────────────────────────
// Must be registered BEFORE the React Router catch-all

app.use("/mcp", express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId)!.handleRequest(req, res, req.body);
      return;
    }

    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Not an initialize request and no session ID" },
        id: req.body?.id ?? null,
      });
      return;
    }

    const server = await createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };

    await server.connect(transport);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP POST error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: req.body?.id ?? null,
      });
    }
  }
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid session" } });
    return;
  }
  await transports.get(sessionId)!.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid session" } });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
  transports.delete(sessionId);
});

// ── React Router catch-all ────────────────────────────────────────────

const viteDevServer =
  process.env.NODE_ENV === "production"
    ? undefined
    : await import("vite").then((vite) =>
        vite.createServer({ server: { middlewareMode: true } })
      );

if (viteDevServer) {
  app.use(viteDevServer.middlewares);
} else {
  app.use(express.static("build/client"));
}

app.all(
  "*",
  createRequestHandler({
    build: viteDevServer
      ? () => viteDevServer.ssrLoadModule("virtual:react-router/server-build")
      : // @ts-expect-error — build output path
        await import("./build/server/index.js"),
  })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
```

- [ ] **Step 3: Stub `app/mcp/server.ts` so the import resolves**

Create a minimal stub so `server.ts` compiles:

```typescript
// app/mcp/server.ts — stub, implemented in Task 5
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "siliconharbour",
    version: "1.0.0",
  });
  return server;
}
```

- [ ] **Step 4: Verify dev server starts**

```bash
pnpm dev
```

Expected: server starts on port 5173 (or 3000), `/` loads the home page. MCP endpoint is mounted (will return 400 for non-initialize requests, which is correct). Fix any import errors before proceeding.

- [ ] **Step 5: Commit**

```bash
git add server.ts app/mcp/server.ts
git commit -m "feat: add custom Express server with MCP endpoint stub"
```

---

## Task 3: `search` tool

**Files:**
- Create: `app/mcp/search.ts`

The `search` tool filters `public/openapi.json` and returns matching schema definitions. Loaded once at module init, filtered per call.

- [ ] **Step 1: Create `app/mcp/search.ts`**

```typescript
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const openapiPath = join(__dirname, "../../public/openapi.json");

// Load once at module init
const spec = JSON.parse(readFileSync(openapiPath, "utf-8")) as {
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown> };
};

function schemaToText(name: string, schema: Record<string, unknown>): string {
  const props = (schema.properties as Record<string, { type?: string; description?: string; nullable?: boolean }>) ?? {};
  const fields = Object.entries(props)
    .map(([k, v]) => `  ${k}: ${v.type ?? "object"}${v.nullable ? " | null" : ""}`)
    .join("\n");
  return `### ${name}\n${fields}`;
}

function endpointToText(path: string, methods: Record<string, { summary?: string; description?: string }>): string {
  return Object.entries(methods)
    .map(([method, op]) => `  ${method.toUpperCase()} ${path} — ${op.summary ?? ""}`)
    .join("\n");
}

export function searchSpec(query: string): string {
  const q = query.toLowerCase();
  const results: string[] = [];

  // Match schemas
  for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
    const s = schema as Record<string, unknown>;
    const text = JSON.stringify(s).toLowerCase();
    if (name.toLowerCase().includes(q) || text.includes(q)) {
      results.push(schemaToText(name, s));
    }
  }

  // Match endpoints
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    if (path.toLowerCase().includes(q) || JSON.stringify(methods).toLowerCase().includes(q)) {
      results.push(endpointToText(path, methods as Record<string, { summary?: string }>));
    }
  }

  if (results.length === 0) {
    return `No matches found for "${query}". Try: event, job, company, group, person, education, technology, product, project`;
  }

  // Add module hint for known entity queries
  const moduleHints: Record<string, string> = {
    event: "Available in siliconharbour module: events({ limit?, offset?, upcoming? })",
    job: "Available in siliconharbour module: jobs({ limit?, offset?, query? })",
    company: "Available in siliconharbour module: companies({ limit?, offset?, query? })",
    group: "Available in siliconharbour module: groups({ limit?, offset? })",
    person: "Available in siliconharbour module: people({ limit?, offset?, query? })",
    people: "Available in siliconharbour module: people({ limit?, offset?, query? })",
    education: "Available in siliconharbour module: education({ limit?, offset? })",
    technology: "Available in siliconharbour module: technologies({ limit?, offset? })",
  };

  const hint = Object.entries(moduleHints).find(([k]) => q.includes(k))?.[1];

  return [
    results.slice(0, 5).join("\n\n"),
    hint ? `\n${hint}` : "",
  ].join("").trim();
}
```

- [ ] **Step 2: Verify it compiles**

```bash
node --input-type=module << 'EOF'
import { searchSpec } from './app/mcp/search.ts'
console.log(searchSpec('event'))
EOF
```

Wait — tsx is needed for .ts imports in node. Use:

```bash
npx tsx -e "import { searchSpec } from './app/mcp/search.ts'; console.log(searchSpec('event').substring(0, 300))"
```

Expected: prints Event schema fields and the module hint.

- [ ] **Step 3: Commit**

```bash
git add app/mcp/search.ts
git commit -m "feat: add MCP search tool - openapi.json schema filter"
```

---

## Task 4: QuickJS sandbox

**Files:**
- Create: `app/mcp/sandbox.ts`
- Create: `app/mcp/modules/siliconharbour-read.ts`
- Create: `app/mcp/modules/siliconharbour-execute.ts`

The sandbox wraps `@sebastianwessel/quickjs`. Host functions are bridged into the WASM context via a `globalThis.__sh__` object that the module JS string reads from. The bridge object is set on the QuickJS context before running user code.

- [ ] **Step 1: Create `app/mcp/modules/siliconharbour-read.ts`**

This file generates the JS string for the virtual `siliconharbour` module injected into the read-only sandbox. The module exports async functions that delegate to `globalThis.__sh__`.

```typescript
/**
 * Generates the JS string for the read-only 'siliconharbour' virtual module.
 * This runs inside the QuickJS WASM sandbox — it can only access globalThis.__sh__.
 * No imports, no require(), no network access.
 */
export function buildReadModuleJs(): string {
  return `
export async function events(opts) {
  return await globalThis.__sh__.events(opts ?? {});
}
export async function jobs(opts) {
  return await globalThis.__sh__.jobs(opts ?? {});
}
export async function companies(opts) {
  return await globalThis.__sh__.companies(opts ?? {});
}
export async function groups(opts) {
  return await globalThis.__sh__.groups(opts ?? {});
}
export async function people(opts) {
  return await globalThis.__sh__.people(opts ?? {});
}
export async function technologies(opts) {
  return await globalThis.__sh__.technologies(opts ?? {});
}
export async function education(opts) {
  return await globalThis.__sh__.education(opts ?? {});
}
`;
}
```

- [ ] **Step 2: Create `app/mcp/modules/siliconharbour-execute.ts`**

```typescript
/**
 * Generates the JS string for the authenticated 'siliconharbour' virtual module.
 * Superset of the read module — adds sync actions and pending review functions.
 */
export function buildExecuteModuleJs(): string {
  return `
export async function events(opts) {
  return await globalThis.__sh__.events(opts ?? {});
}
export async function jobs(opts) {
  return await globalThis.__sh__.jobs(opts ?? {});
}
export async function companies(opts) {
  return await globalThis.__sh__.companies(opts ?? {});
}
export async function groups(opts) {
  return await globalThis.__sh__.groups(opts ?? {});
}
export async function people(opts) {
  return await globalThis.__sh__.people(opts ?? {});
}
export async function technologies(opts) {
  return await globalThis.__sh__.technologies(opts ?? {});
}
export async function education(opts) {
  return await globalThis.__sh__.education(opts ?? {});
}
export async function eventImportSources() {
  return await globalThis.__sh__.eventImportSources();
}
export async function jobImportSources() {
  return await globalThis.__sh__.jobImportSources();
}
export async function pendingEvents() {
  return await globalThis.__sh__.pendingEvents();
}
export async function pendingJobs() {
  return await globalThis.__sh__.pendingJobs();
}
export async function syncEventSource(sourceId) {
  return await globalThis.__sh__.syncEventSource(sourceId);
}
export async function syncAllEventSources() {
  return await globalThis.__sh__.syncAllEventSources();
}
export async function syncJobSource(sourceId) {
  return await globalThis.__sh__.syncJobSource(sourceId);
}
export async function syncAllJobSources() {
  return await globalThis.__sh__.syncAllJobSources();
}
`;
}
```

- [ ] **Step 3: Create `app/mcp/sandbox.ts`**

```typescript
import variant from "@jitl/quickjs-ng-wasmfile-release-sync";
import { loadQuickJs, type SandboxOptions } from "@sebastianwessel/quickjs";
import { buildReadModuleJs } from "./modules/siliconharbour-read.js";
import { buildExecuteModuleJs } from "./modules/siliconharbour-execute.js";

// Load QuickJS WASM once at module init — resource intensive
const { runSandboxed } = await loadQuickJs(variant);

export type BridgeFunction = (...args: unknown[]) => Promise<unknown>;
export type Bridge = Record<string, BridgeFunction>;

/**
 * Run user-supplied JS code in a QuickJS WASM sandbox.
 * The bridge object is exposed as globalThis.__sh__ inside the sandbox.
 * The code must export a default value which is returned as the result.
 *
 * @param code - User JS: async arrow function body or module with `export default`
 * @param bridge - Host functions exposed as globalThis.__sh__
 * @param timeoutMs - Kill the sandbox after this many milliseconds
 */
export async function runInSandbox(
  code: string,
  bridge: Bridge,
  timeoutMs = 5_000,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  // Wrap code in export default if it looks like a bare async arrow function
  const wrappedCode = code.trim().startsWith("async") && !code.includes("export default")
    ? `export default await (${code})()`
    : code;

  const options: SandboxOptions = {
    allowFetch: false,
    allowFs: false,
    nodeModules: {
      siliconharbour: {
        "index.js": buildReadModuleJs(), // overridden in execute calls
      },
    },
  };

  try {
    const result = await runSandboxed(
      async ({ evalCode, setProp, getGlobal }) => {
        // Inject the bridge as globalThis.__sh__
        // Each bridge function is serialised through JSON to cross the WASM boundary
        const globalThis_ = getGlobal();
        const shObj: Record<string, (...args: unknown[]) => Promise<string>> = {};

        for (const [key, fn] of Object.entries(bridge)) {
          shObj[key] = async (...args: unknown[]) => {
            const result = await fn(...args);
            return JSON.stringify(result);
          };
        }

        setProp(globalThis_, "__sh__", shObj);

        return evalCode(wrappedCode);
      },
      { ...options, timeout: timeoutMs },
    );

    if (result.ok) {
      return { ok: true, data: result.data };
    } else {
      return { ok: false, error: String(result.error) };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Same as runInSandbox but injects the execute module (read + actions).
 */
export async function runInExecuteSandbox(
  code: string,
  bridge: Bridge,
  timeoutMs = 60_000,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  // Override the siliconharbour module with the execute version
  // We do this by replacing the module JS in the options
  const wrappedCode = code.trim().startsWith("async") && !code.includes("export default")
    ? `export default await (${code})()`
    : code;

  const options: SandboxOptions = {
    allowFetch: false,
    allowFs: false,
    nodeModules: {
      siliconharbour: {
        "index.js": buildExecuteModuleJs(),
      },
    },
  };

  try {
    const result = await runSandboxed(
      async ({ evalCode, setProp, getGlobal }) => {
        const globalThis_ = getGlobal();
        const shObj: Record<string, (...args: unknown[]) => Promise<string>> = {};

        for (const [key, fn] of Object.entries(bridge)) {
          shObj[key] = async (...args: unknown[]) => {
            const result = await fn(...args);
            return JSON.stringify(result);
          };
        }

        setProp(globalThis_, "__sh__", shObj);

        return evalCode(wrappedCode);
      },
      { ...options, timeout: timeoutMs },
    );

    if (result.ok) {
      return { ok: true, data: result.data };
    } else {
      return { ok: false, error: String(result.error) };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

**Note:** The exact `@sebastianwessel/quickjs` API for setting globals (`setProp`, `getGlobal`) may differ from the above. Read the package source at `node_modules/@sebastianwessel/quickjs/` if the above API doesn't match. The key pattern is: inject a named object on the QuickJS global context before `evalCode` runs. The `runSandboxed` callback receives helper functions for this — check the actual API during implementation.

- [ ] **Step 4: Verify sandbox compiles**

```bash
pnpm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -10
```

Expected: no errors in `app/mcp/`.

- [ ] **Step 5: Commit**

```bash
git add app/mcp/sandbox.ts app/mcp/modules/
git commit -m "feat: add QuickJS sandbox wrapper and siliconharbour virtual modules"
```

---

## Task 5: Host bridge functions

**Files:**
- Create: `app/mcp/bridge.ts`

The bridge provides the host-side implementations of all functions exposed via `globalThis.__sh__`. These call the existing `app/lib/*.server.ts` functions and return plain JSON-serialisable objects.

- [ ] **Step 1: Create `app/mcp/bridge.ts`**

```typescript
import type { Bridge } from "./sandbox.js";
import { getUpcomingEvents, getPaginatedEvents } from "~/lib/events.server";
import { getPaginatedJobs, getActiveJobs } from "~/lib/jobs.server";
import { getPaginatedCompanies } from "~/lib/companies.server";
import { getPaginatedGroups } from "~/lib/groups.server";
import { getPaginatedPeople } from "~/lib/people.server";
import { getAllTechnologies } from "~/lib/technologies.server";
import { getPaginatedEducation } from "~/lib/education.server";
import {
  getAllEventImportSources,
  syncEvents,
} from "~/lib/event-importers/sync.server";
import {
  getAllImportSources,
  syncJobs,
} from "~/lib/job-importers/sync.server";
import { db } from "~/db";
import { events, jobs, eventImportSources, jobImportSources, companies } from "~/db/schema";
import { eq, and } from "drizzle-orm";

/** Serialize a value to plain JSON-compatible types — strips class instances, Dates, etc. */
function toPlain(val: unknown): unknown {
  return JSON.parse(JSON.stringify(val, (_key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  }));
}

export function buildReadBridge(): Bridge {
  return {
    async events({ limit = 20, offset = 0, upcoming = false }: { limit?: number; offset?: number; upcoming?: boolean } = {}) {
      if (upcoming) {
        const all = await getUpcomingEvents();
        return toPlain(all.slice(offset, offset + limit));
      }
      const result = await getPaginatedEvents(limit, offset);
      return toPlain(result.events ?? result);
    },

    async jobs({ limit = 20, offset = 0, query }: { limit?: number; offset?: number; query?: string } = {}) {
      const result = await getPaginatedJobs(limit, offset, query, { includeNonTechnical: true });
      return toPlain(result.jobs ?? result);
    },

    async companies({ limit = 20, offset = 0, query }: { limit?: number; offset?: number; query?: string } = {}) {
      const result = await getPaginatedCompanies(limit, offset, query);
      return toPlain(result.companies ?? result);
    },

    async groups({ limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}) {
      const result = await getPaginatedGroups(limit, offset);
      return toPlain(result.groups ?? result);
    },

    async people({ limit = 20, offset = 0, query }: { limit?: number; offset?: number; query?: string } = {}) {
      const result = await getPaginatedPeople(limit, offset, query);
      return toPlain(result.people ?? result);
    },

    async technologies({ limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}) {
      const all = await getAllTechnologies();
      return toPlain(all.slice(offset, offset + limit));
    },

    async education({ limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}) {
      const result = await getPaginatedEducation(limit, offset);
      return toPlain(result.education ?? result);
    },
  };
}

export function buildExecuteBridge(): Bridge {
  return {
    ...buildReadBridge(),

    async eventImportSources() {
      const sources = await getAllEventImportSources();
      return toPlain(sources.map(s => ({
        id: s.id,
        name: s.name,
        sourceType: s.sourceType,
        lastFetchedAt: s.lastFetchedAt,
        fetchStatus: s.fetchStatus,
        pendingCount: s.pendingCount,
      })));
    },

    async jobImportSources() {
      const sources = await getAllImportSources();
      return toPlain(sources.map(s => ({
        id: s.id,
        name: s.name ?? s.sourceIdentifier,
        sourceType: s.sourceType,
        lastFetchedAt: s.lastFetchedAt,
        fetchStatus: s.fetchStatus,
      })));
    },

    async pendingEvents() {
      const sources = await getAllEventImportSources();
      const pending = [];
      for (const source of sources) {
        const evts = await db
          .select({ id: events.id, title: events.title, firstSeenAt: events.firstSeenAt })
          .from(events)
          .where(and(eq(events.importSourceId, source.id), eq(events.importStatus, "pending_review")))
          .limit(50);
        for (const e of evts) {
          pending.push({
            sourceId: source.id,
            sourceName: source.name,
            eventId: e.id,
            title: e.title,
            firstSeenAt: e.firstSeenAt,
          });
        }
      }
      return toPlain(pending);
    },

    async pendingJobs() {
      const sources = await getAllImportSources();
      const pending = [];
      for (const source of sources) {
        const jobRows = await db
          .select({
            id: jobs.id,
            title: jobs.title,
            companyId: jobs.companyId,
          })
          .from(jobs)
          .where(and(eq(jobs.sourceId, source.id), eq(jobs.status, "pending_review")))
          .limit(50);
        for (const j of jobRows) {
          const [company] = await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, j.companyId))
            .limit(1);
          pending.push({
            sourceId: source.id,
            sourceName: source.sourceIdentifier,
            jobId: j.id,
            title: j.title,
            companyName: company?.name ?? null,
          });
        }
      }
      return toPlain(pending);
    },

    async syncEventSource(sourceId: number) {
      const result = await syncEvents(sourceId);
      return toPlain(result);
    },

    async syncAllEventSources() {
      const sources = await getAllEventImportSources();
      const results = [];
      for (const source of sources) {
        const result = await syncEvents(source.id);
        results.push({ sourceId: source.id, name: source.name, ...result });
      }
      return toPlain(results);
    },

    async syncJobSource(sourceId: number) {
      const result = await syncJobs(sourceId);
      return toPlain(result);
    },

    async syncAllJobSources() {
      const sources = await getAllImportSources();
      const results = [];
      for (const source of sources) {
        const result = await syncJobs(source.id);
        results.push({ sourceId: source.id, name: source.sourceIdentifier, ...result });
      }
      return toPlain(results);
    },
  };
}
```

**Note on `getPaginatedJobs` signature:** Check the actual signature in `app/lib/jobs.server.ts` — it may accept `(limit, offset, searchQuery?, options?)` or similar. Adjust the call above to match.

**Note on `getPaginatedCompanies`, `getPaginatedGroups`, `getPaginatedPeople`, `getPaginatedEducation`:** Check their actual return shapes in the respective `.server.ts` files — they may return `{ items, total }` or `{ companies, total }` etc. Adapt the `.companies ?? result` fallback accordingly.

- [ ] **Step 2: Verify build**

```bash
pnpm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -10
```

Fix any type errors in the bridge. The most common issue will be mismatched return type shapes from paginated functions — check each function's actual return type.

- [ ] **Step 3: Commit**

```bash
git add app/mcp/bridge.ts
git commit -m "feat: add MCP host bridge functions connecting DB to sandbox"
```

---

## Task 6: Wire tools into MCP server

**Files:**
- Modify: `app/mcp/server.ts` (replace stub with full implementation)

- [ ] **Step 1: Replace `app/mcp/server.ts` with full implementation**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchSpec } from "./search.js";
import { runInSandbox, runInExecuteSandbox } from "./sandbox.js";
import { buildReadBridge, buildExecuteBridge } from "./bridge.js";

const readBridge = buildReadBridge();
// Execute bridge is built fresh to pick up any runtime state
// (sync results etc. must not be cached between calls)

export async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "siliconharbour",
    version: "1.0.0",
  });

  // ── Tool 1: search ──────────────────────────────────────────────────
  server.registerTool(
    "search",
    {
      title: "Search SiliconHarbour schema",
      description: [
        "Search the SiliconHarbour API schema to discover available data types and field shapes.",
        "Call this first to learn what entities exist and what fields they have.",
        "Then use 'query' to fetch data using those field names.",
        "Example queries: 'event', 'job fields', 'company', 'what entities are available'",
      ].join(" "),
      inputSchema: {
        query: z.string().describe("What to search for, e.g. 'event', 'job', 'company schema'"),
      },
    },
    async ({ query }) => ({
      content: [{ type: "text", text: searchSpec(query) }],
    })
  );

  // ── Tool 2: query ───────────────────────────────────────────────────
  server.registerTool(
    "query",
    {
      title: "Query SiliconHarbour data",
      description: [
        "Execute JavaScript in a secure sandbox to query SiliconHarbour community data.",
        "Import functions from 'siliconharbour': events, jobs, companies, groups, people, technologies, education.",
        "Your code must export a default value. Use 'search' first to discover available fields.",
        "Example: import { events } from 'siliconharbour'; export default await events({ upcoming: true, limit: 5 })",
        "Timeout: 5 seconds.",
      ].join(" "),
      inputSchema: {
        code: z.string().describe("JavaScript module with 'export default' returning the data you want"),
      },
    },
    async ({ code }) => {
      const result = await runInSandbox(code, readBridge, 5_000);
      if (result.ok) {
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      }
      return {
        content: [{ type: "text", text: `Error: ${result.error}` }],
        isError: true,
      };
    }
  );

  // ── Tool 3: execute ─────────────────────────────────────────────────
  server.registerTool(
    "execute",
    {
      title: "Execute authenticated SiliconHarbour actions",
      description: [
        "Like 'query' but also exposes sync and pending-review functions. Requires apiToken.",
        "Additional functions: eventImportSources, jobImportSources, pendingEvents, pendingJobs,",
        "syncEventSource(id), syncAllEventSources, syncJobSource(id), syncAllJobSources.",
        "Timeout: 60 seconds (syncs fetch external pages and may be slow).",
        "If sync times out, use query to check pending items instead.",
      ].join(" "),
      inputSchema: {
        code: z.string().describe("JavaScript module with 'export default' returning results"),
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

      const executeBridge = buildExecuteBridge();
      const result = await runInExecuteSandbox(code, executeBridge, 60_000);

      if (result.ok) {
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      }
      return {
        content: [{ type: "text", text: `Error: ${result.error}` }],
        isError: true,
      };
    }
  );

  return server;
}
```

- [ ] **Step 2: Verify build and dev server**

```bash
pnpm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -10
pnpm dev &
sleep 3
# Test MCP endpoint responds to initialize
curl -s -X POST http://localhost:5173/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

Expected: JSON response with `sessionId` in the `Mcp-Session-Id` response header and a `result` containing server capabilities. Kill the dev server after testing.

- [ ] **Step 3: Commit**

```bash
git add app/mcp/server.ts
git commit -m "feat: wire search, query, execute tools into MCP server"
```

---

## Task 7: End-to-end test with MCP Inspector

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Run MCP Inspector**

In a separate terminal:

```bash
npx @modelcontextprotocol/inspector
```

Open `http://localhost:6274` in browser.

- [ ] **Step 3: Connect and test each tool**

1. Set Transport Type: **Streamable HTTP**
2. Set URL: `http://localhost:5173/mcp`
3. Click **Connect** — should show server name "siliconharbour" and 3 tools listed

**Test `search`:**
- Call `search` with `{ "query": "event" }`
- Expected: Event schema fields + module hint

**Test `query`:**
- Call `query` with:
  ```json
  { "code": "import { events } from 'siliconharbour'\nexport default await events({ limit: 3 })" }
  ```
- Expected: JSON array of up to 3 events

**Test `execute` without token:**
- Call `execute` with `{ "code": "export default 'hello'", "apiToken": "wrong" }`
- Expected: `isError: true`, "Invalid or missing apiToken"

**Test `execute` with token:**
- Set `MCP_API_TOKEN=test-token-123` in your shell env and restart dev server
- Call `execute` with `{ "code": "import { eventImportSources } from 'siliconharbour'\nexport default await eventImportSources()", "apiToken": "test-token-123" }`
- Expected: JSON array of event import sources

- [ ] **Step 4: Fix any issues found, then commit**

```bash
git add -A
git commit -m "fix: MCP server e2e fixes from inspector testing"
```

---

## Task 8: Quality gates + production config

- [ ] **Step 1: Lint fix**

```bash
pnpm run lint:fix
```

- [ ] **Step 2: Full build**

```bash
pnpm run build
```

Expected: clean build.

- [ ] **Step 3: Document MCP_API_TOKEN in README or docs**

In `docs/`, create or update a note about the required env var. No need for a full doc — a comment in the Dockerfile is enough:

Add to the Dockerfile (above `CMD`):
```dockerfile
# Required env vars:
# MCP_API_TOKEN=<random secret> — required for execute tool authentication
# Generate with: openssl rand -hex 32
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: MCP server — search/query/execute tools with QuickJS sandbox"
```
