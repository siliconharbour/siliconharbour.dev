# MCP Server Design Spec

**Date:** 2026-04-03
**Status:** Approved, ready for implementation

---

## Overview

An MCP server mounted at `/mcp` inside the existing React Router v7 app, exposing SiliconHarbour community data and import sync actions to AI clients. Inspired by Cloudflare's Code Mode pattern: instead of one tool per entity (18+ tools, 2000+ tokens), the server exposes 3 tools with a fixed ~300-token footprint regardless of how many entities exist.

---

## Goals

- Allow an AI assistant to query all SiliconHarbour community data (events, jobs, companies, people, etc.) using a code-as-query pattern
- Allow the AI to discover available data shapes via the existing OpenAPI spec
- Allow an authenticated personal AI to trigger import syncs and list pending review items
- Keep the tool surface minimal and fixed — adding new entities to the site doesn't require adding new MCP tools

## Non-Goals

- Multi-user auth / OAuth 2.1 (single shared Bearer token is sufficient)
- MCP server-initiated push notifications (inline tool responses are enough)
- Arbitrary write access (only sync actions and read queries)
- Exposing admin manage UI functionality beyond sync

---

## Architecture

```
Client (Claude Desktop / personal AI)
         │
         │ POST/GET/DELETE /mcp
         ▼
┌─────────────────────────────────────────┐
│  server.ts (custom Express server)      │
│                                         │
│  /mcp → MCP SDK (StreamableHTTP)        │
│  /*   → React Router request handler   │
└─────────────────────────────────────────┘
         │
         │ tool calls
         ▼
┌─────────────────────────────────────────┐
│  app/mcp/server.ts                      │
│                                         │
│  search  → filter /public/openapi.json  │
│  query   → QuickJS sandbox (read-only)  │
│  execute → QuickJS sandbox (read+write) │
└─────────────────────────────────────────┘
         │
         ├─ read functions → app/lib/*.server.ts
         └─ sync functions → app/lib/event-importers/sync.server.ts
                             app/lib/job-importers/sync.server.ts
```

### Server migration

Currently uses `react-router-serve`. Switching to a custom Express server is required — `react-router-serve` doesn't expose raw request/response objects that MCP needs (SSE streaming, `Mcp-Session-Id` header, etc.).

**`server.ts`** (new, project root) — mounts `/mcp` before the React Router catch-all. Uses stateful MCP sessions (in-memory `Map<sessionId, transport>`). Fine for a single-process server.

**Script changes:**
```json
"dev":   "tsx watch server.ts",
"build": "react-router build && esbuild server.ts --bundle --platform=node --outfile=build/server/server.js --external:./build/server/index.js",
"start": "NODE_ENV=production node build/server/server.js"
```

`esbuild` bundles `server.ts` alongside the React Router build output. The custom server imports the React Router build as an external so it doesn't get double-bundled. `esbuild` is already in the project (used by Vite internally) and can be invoked directly.

**Dockerfile:** `CMD` changes from `react-router-serve ./build/server/index.js` to `node build/server/server.js`.

---

## The 3 Tools

### Tool 1: `search`

**Public — no auth required.**

Searches `/public/openapi.json` and returns matching schema definitions and endpoint summaries. The AI calls this first to discover what data exists and what fields each entity has — the full OpenAPI spec never enters model context.

```
inputSchema:
  query: string   — e.g. "event", "job fields", "company schema"

output: text — matching schema definitions + field names + example values
```

Implementation: load `openapi.json` once at server startup. On each call, filter `paths` and `components.schemas` by the query string (case-insensitive substring match on names, descriptions, and field names). Return the matching slice as formatted text. No sandbox needed — pure JSON filtering.

**Example interaction:**
```
AI: search("event")
→  Event schema: { id, slug, title, description, organizer, location, 
                   link, coverImage, dates: [{startDate, endDate}], 
                   url, createdAt, updatedAt }
   Available in siliconharbour module: events({ limit?, offset?, upcoming? })
```

---

### Tool 2: `query`

**Public — no auth required.**

Executes a JS async arrow function in a QuickJS WASM sandbox. The sandbox has a read-only `siliconharbour` module injected as a custom node module. No network access, no filesystem access, no require() escaping.

```
inputSchema:
  code: string   — JS async arrow function body

output: text — JSON.stringify of the export default value, or error message
```

**The injected `siliconharbour` module (read-only):**

```ts
// Available inside sandbox via: import { ... } from 'siliconharbour'
events(opts?: { limit?: number; offset?: number; upcoming?: boolean }): Promise<Event[]>
jobs(opts?: { limit?: number; offset?: number; query?: string }): Promise<Job[]>
companies(opts?: { limit?: number; offset?: number; query?: string }): Promise<Company[]>
groups(opts?: { limit?: number; offset?: number }): Promise<Group[]>
people(opts?: { limit?: number; offset?: number; query?: string }): Promise<Person[]>
technologies(opts?: { limit?: number; offset?: number }): Promise<Technology[]>
education(opts?: { limit?: number; offset?: number }): Promise<Education[]>
```

Each function is a thin wrapper over the existing `app/lib/*.server.ts` query functions, serialised to plain JSON before being returned into the sandbox (so no Drizzle types or DB handles ever enter the WASM boundary).

**Sandbox setup:**
```ts
import variant from "@jitl/quickjs-ng-wasmfile-release-sync";
import { loadQuickJs } from "@sebastianwessel/quickjs";

// Loaded once at server startup — resource intensive
const { runSandboxed } = await loadQuickJs(variant);
```

The `nodeModules` option injects the `siliconharbour` module as a virtual module whose `index.js` content is a pre-built JS string. Host functions are bridged into the sandbox via `globalThis.__sh__` — an object the host sets on the QuickJS context before running user code, with one async function per entity. The module JS string calls `globalThis.__sh__.events(opts)` etc. and returns the result. The sandbox cannot access the real DB or any host module directly — `__sh__` is the only exit point.

**Example query:**
```js
import { events, jobs } from 'siliconharbour'

const upcoming = await events({ upcoming: true, limit: 5 })
const techJobs = await jobs({ query: 'react', limit: 10 })

export default { upcoming, techJobs }
```

**Timeout:** 5 seconds. Any code that doesn't complete within 5s is killed.

---

### Tool 3: `execute`

**Authenticated — requires `apiToken` argument matching `MCP_API_TOKEN` env var.**

Same as `query` — executes a JS async arrow function in a QuickJS sandbox — but the injected `siliconharbour` module includes additional action functions for triggering syncs and reading pending review state.

```
inputSchema:
  code:     string   — JS async arrow function body
  apiToken: string   — must match process.env.MCP_API_TOKEN

output: text — JSON.stringify of the export default value, or error message
```

If `apiToken` does not match, returns an error immediately without running any code.

**The injected `siliconharbour` module (read + actions):**

All read functions from `query`, plus:

```ts
// Sync actions
syncEventSource(sourceId: number): Promise<{ added: number; skipped: number; removed: number; error?: string }>
syncAllEventSources(): Promise<Array<{ sourceId: number; name: string; added: number; skipped: number; removed: number; error?: string }>>
syncJobSource(sourceId: number): Promise<{ added: number; updated: number; removed: number; error?: string }>
syncAllJobSources(): Promise<Array<{ sourceId: number; name: string; added: number; updated: number; removed: number; error?: string }>>

// Pending review
pendingEvents(): Promise<Array<{ sourceId: number; sourceName: string; eventId: number; title: string; startDate: string | null }>>
pendingJobs(): Promise<Array<{ sourceId: number; sourceName: string; jobId: number; title: string; companyName: string | null }>>

// Import source listing (useful before syncing)
eventImportSources(): Promise<Array<{ id: number; name: string; sourceType: string; lastFetchedAt: string | null; fetchStatus: string; pendingCount: number }>>
jobImportSources(): Promise<Array<{ id: number; name: string; sourceType: string; lastFetchedAt: string | null; fetchStatus: string }>>
```

**Example execute — "what needs my attention?":**
```js
import { pendingEvents, pendingJobs } from 'siliconharbour'

const events = await pendingEvents()
const jobs = await pendingJobs()

export default {
  pendingEventCount: events.length,
  pendingJobCount: jobs.length,
  events: events.map(e => `${e.title} (source: ${e.sourceName})`),
  jobs: jobs.map(j => `${j.title} at ${j.companyName ?? 'unknown'} (source: ${j.sourceName})`),
}
```

**Example execute — sync all and report:**
```js
import { syncAllEventSources, syncAllJobSources } from 'siliconharbour'

const eventResults = await syncAllEventSources()
const jobResults = await syncAllJobSources()

const newEvents = eventResults.reduce((n, r) => n + r.added, 0)
const newJobs = jobResults.reduce((n, r) => n + r.added, 0)

export default { newEvents, newJobs, eventResults, jobResults }
```

**Timeout:** 60 seconds (syncs can take time fetching external pages).

---

## File Layout

```
server.ts                           ← new: custom Express server (project root)

app/mcp/
  server.ts                         ← McpServer instance + tool registrations
  sandbox.ts                        ← QuickJS setup, runSandboxed wrapper
  modules/
    siliconharbour-read.ts           ← builds the read-only module JS string
    siliconharbour-execute.ts        ← builds the read+write module JS string
  search.ts                         ← openapi.json search logic
```

**Modified files:**
- `package.json` — dev/start scripts, add `@sebastianwessel/quickjs`, `@jitl/quickjs-ng-wasmfile-release-sync`, `@modelcontextprotocol/sdk`, `express`, `@types/express`
- `Dockerfile` (or equivalent deploy config) — update CMD

---

## Security Model

**`query` tool (public):**
- QuickJS WASM sandbox: no filesystem, no network, no `require()` escape
- DB is never exposed — only pre-serialised JSON from host functions crosses the boundary
- 5s timeout kills runaway code
- No destructive operations possible — module only has read functions

**`execute` tool (authenticated):**
- Same WASM sandbox constraints
- Auth check happens on the host before the sandbox runs — wrong token = immediate error, no code executed
- Action functions call existing sync logic which already has its own error handling
- Sync functions are the only side effects; no raw DB writes exposed

**MCP transport level:**
- DNS rebinding protection via `hostHeaderValidation` middleware from MCP SDK
- Origin header validation in production (allow only `https://siliconharbour.dev`)
- `MCP_API_TOKEN` is a long random secret set as an env var, never logged

---

## Environment Variables

```
MCP_API_TOKEN=<long random secret>   — required for execute tool
SITE_URL=https://siliconharbour.dev  — already exists
```

---

## Client Configuration

**Claude Desktop / OpenCode / any MCP client:**
```json
{
  "mcpServers": {
    "siliconharbour": {
      "url": "https://siliconharbour.dev/mcp"
    }
  }
}
```

---

## Typical AI Workflow

```
1. search("what entities are available")
   → lists events, jobs, companies, groups, people, etc. with field shapes

2. query(...)
   → reads data, combines entities, filters/formats as needed

3. execute(code, apiToken)
   → syncs sources, reads pending items, reports back
```

---

## Open Questions / Future Work

- **`@jitl/quickjs-ng-wasmfile-release-sync` vs async variant:** the sync variant blocks the event loop during execution. For 5s query timeouts this is likely fine; for 60s execute timeouts (sync operations), the async variant (`@jitl/quickjs-ng-wasmfile-release-asyncify`) is preferable to avoid blocking other requests. To confirm during implementation.
- **QuickJS WASM startup cost:** `loadQuickJs` is resource-intensive and must be called once at server startup, not per request. The `runSandboxed` handle is stored in module scope and reused.
- **esbuild vs tsx for production server bundle:** the build step uses esbuild to bundle `server.ts`. If the project adds more server-only dependencies, the `--external` list may need expanding. Alternative: use `tsx` directly in production (no bundle step, just `tsx server.ts`) — simpler but slower cold start.
