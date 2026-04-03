# Setting Up an MCP Server in a React Router v7 App

A step-by-step tutorial for adding a Model Context Protocol (MCP) server endpoint to an existing React Router v7 application using Streamable HTTP transport.

> **Important:** If you get stuck on any React Router v7 or MCP SDK specifics during implementation, use [Context7](https://github.com/upstash/context7) MCP to look up the latest docs for `@modelcontextprotocol/sdk`, `react-router`, or `@react-router/node`. The APIs move fast and Context7 will give you version-accurate info.

---

## Overview

### What we're building

We're mounting an MCP server at `/mcp` inside a React Router v7 app. This lets MCP clients (Claude Desktop, Claude.ai, Cursor, etc.) connect to your app and call tools you define — all served from the same deployment as your web app.

### Architecture

```
┌───────────────────────────────────────────┐
│         React Router v7 App               │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │  Express / Hono custom server       │  │
│  │                                     │  │
│  │  POST/GET/DELETE /mcp  → MCP SDK    │  │
│  │  Everything else       → React Router│  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
```

### Why a custom server?

React Router v7's built-in `react-router-serve` doesn't expose the raw request/response objects MCP needs (SSE streaming, custom headers like `Mcp-Session-Id`, etc.). We need a custom Express or Hono server that handles `/mcp` directly and passes everything else through to React Router.

### Key decisions

- **Transport:** Streamable HTTP (the modern MCP transport — not the deprecated SSE transport)
- **Session mode:** Stateful with session IDs (recommended for most use cases; stateless option noted where relevant)
- **Server framework:** Express (examples also note Hono alternative)
- **SDK packages:** `@modelcontextprotocol/sdk` (core) + `@modelcontextprotocol/node` (Node.js HTTP adapter)

---

## Prerequisites

- A working React Router v7 app (framework mode)
- Node.js 18+
- Familiarity with TypeScript and React Router v7 concepts (loaders, routes, etc.)

---

## Step 1: Install dependencies

```bash
npm install @modelcontextprotocol/sdk @modelcontextprotocol/node zod
npm install express
npm install -D @types/express
```

> **Note on SDK versions:** The MCP TypeScript SDK has undergone a major restructuring. As of the v2 generation, the server package is `@modelcontextprotocol/server` and the transport is in `@modelcontextprotocol/node`. However, most current production apps still use the v1 generation where everything is under `@modelcontextprotocol/sdk`. **Use Context7 to look up the current import paths** if you hit module-not-found errors — the SDK split is actively evolving.

If you're on the v1 SDK (`@modelcontextprotocol/sdk`), the imports look like:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
```

If you're on the v2 split packages:

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
```

**Use Context7 to confirm which generation/import paths are current when you implement this.**

---

## Step 2: Create the MCP server module

Create a file that defines your MCP server with its tools, resources, and/or prompts. This module is framework-agnostic — it just sets up the MCP server instance.

### `app/mcp-server.ts`

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Creates and configures a new MCP server instance.
 *
 * We create a fresh server per session (stateful mode) or per request
 * (stateless mode). This function registers all your tools, resources,
 * and prompts.
 */
export function createMcpServer() {
  const server = new McpServer({
    name: "my-react-router-app",
    version: "1.0.0",
  });

  // ── Register your tools ────────────────────────────────────────────
  // Tools are the primary way LLMs interact with your server.
  // Each tool has a name, description, input schema (using Zod), and
  // a handler function.

  server.registerTool(
    "hello",
    {
      title: "Say Hello",
      description: "Returns a greeting for the given name",
      inputSchema: {
        name: z.string().describe("The name to greet"),
      },
    },
    async ({ name }) => ({
      content: [{ type: "text", text: `Hello, ${name}! 👋` }],
    })
  );

  // Example: a tool that interacts with your app's database
  // server.registerTool(
  //   "get-user",
  //   {
  //     title: "Get User",
  //     description: "Look up a user by ID",
  //     inputSchema: {
  //       userId: z.string().describe("The user's ID"),
  //     },
  //   },
  //   async ({ userId }) => {
  //     const user = await db.users.findUnique({ where: { id: userId } });
  //     if (!user) {
  //       return {
  //         content: [{ type: "text", text: `User ${userId} not found` }],
  //         isError: true,
  //       };
  //     }
  //     return {
  //       content: [{ type: "text", text: JSON.stringify(user, null, 2) }],
  //     };
  //   }
  // );

  // ── Register resources (optional) ──────────────────────────────────
  // Resources expose read-only data to clients.

  // server.registerResource(
  //   "app-config",
  //   "config://app",
  //   {
  //     title: "App Configuration",
  //     description: "Current application configuration",
  //     mimeType: "application/json",
  //   },
  //   async (uri) => ({
  //     contents: [{ uri: uri.href, text: JSON.stringify({ env: "production" }) }],
  //   })
  // );

  // ── Register prompts (optional) ────────────────────────────────────
  // Prompts are reusable message templates for consistent LLM interactions.

  // server.registerPrompt(
  //   "summarize",
  //   {
  //     title: "Summarize Content",
  //     description: "Summarize the given content",
  //     argsSchema: { content: z.string() },
  //   },
  //   ({ content }) => ({
  //     messages: [
  //       {
  //         role: "user",
  //         content: { type: "text", text: `Please summarize:\n\n${content}` },
  //       },
  //     ],
  //   })
  // );

  return server;
}
```

---

## Step 3: Set up the custom Express server

React Router v7 supports custom servers via the `node-custom-server` pattern. If you're already using `react-router-serve`, you'll need to switch to a custom server entry point.

### `server.ts` (project root)

```ts
import express from "express";
import { createRequestHandler } from "@react-router/express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./app/mcp-server.js";

const app = express();

// ─── MCP endpoint setup ──────────────────────────────────────────────
// The MCP endpoint MUST be registered BEFORE the React Router catch-all
// handler, otherwise React Router will swallow the requests.

// Parse JSON bodies only on the MCP route
app.use("/mcp", express.json());

// Store active transports by session ID (stateful mode)
const transports: Record<string, StreamableHTTPServerTransport> = {};

// POST /mcp — Client-to-server messages (initialize, tool calls, etc.)
app.post("/mcp", async (req, res) => {
  try {
    // Check for an existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports[sessionId]) {
      // Existing session — route to its transport
      const transport = transports[sessionId];
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // No session yet — this should be an initialize request
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32600,
          message: "Bad Request: No session ID and not an initialize request",
        },
        id: req.body?.id ?? null,
      });
      return;
    }

    // Create new server + transport for this session
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    // Clean up on session close
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && transports[sid]) {
        delete transports[sid];
      }
    };

    // Connect server to transport
    await server.connect(transport);

    // Store for future requests
    if (transport.sessionId) {
      transports[transport.sessionId] = transport;
    }

    // Handle the initialize request
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP POST error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: req.body?.id ?? null,
      });
    }
  }
});

// GET /mcp — Server-to-client notifications via SSE (optional)
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId || !transports[sessionId]) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Bad Request: Invalid or missing session ID" },
    });
    return;
  }

  // This opens an SSE stream for server-initiated messages
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

// DELETE /mcp — Client terminates session
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId || !transports[sessionId]) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Bad Request: Invalid or missing session ID" },
    });
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
  delete transports[sessionId];
});

// ─── React Router handler (catch-all) ────────────────────────────────
// This MUST come after the MCP routes.

const viteDevServer =
  process.env.NODE_ENV === "production"
    ? undefined
    : await import("vite").then((vite) =>
        vite.createServer({ server: { middlewareMode: true } })
      );

if (viteDevServer) {
  app.use(viteDevServer.middlewares);
} else {
  // In production, serve the built client assets
  app.use(express.static("build/client"));
}

app.all(
  "*",
  createRequestHandler({
    // Use Context7 to confirm the correct way to load your build
    // for your React Router version. This pattern may vary.
    build: viteDevServer
      ? () => viteDevServer.ssrLoadModule("virtual:react-router/server-build")
      : // @ts-expect-error — build output
        await import("./build/server/index.js"),
  })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`MCP endpoint available at http://localhost:${PORT}/mcp`);
});
```

---

## Step 4: Update your Vite / React Router config

You need to tell React Router to use your custom server instead of the default `react-router-serve`.

### `vite.config.ts`

Make sure your Vite config doesn't conflict. The key thing is that when using a custom server, you handle the dev server yourself. **Use Context7 to look up the exact Vite plugin config for your React Router v7 version** — it changes between minor versions.

### `react-router.config.ts`

```ts
import type { Config } from "@react-router/dev/config";

export default {
  // Use Context7 to check if your version needs any specific
  // config for custom server mode (e.g., `ssr: true`, `serverModuleFormat`, etc.)
} satisfies Config;
```

### `package.json` scripts

```json
{
  "scripts": {
    "dev": "tsx watch server.ts",
    "build": "react-router build",
    "start": "NODE_ENV=production node build/server/server.js"
  }
}
```

> **Note:** The exact dev/build/start commands depend on your project setup. If you started from the `node-custom-server` template, you may already have this wired up. **Use Context7 to look up the official React Router v7 custom server template** for the canonical approach.

---

## Step 5: Stateless alternative (simpler, serverless-friendly)

If you don't need server-initiated notifications (most simple tool servers don't), you can run fully stateless. This is ideal for serverless/edge deployments.

Replace the session management in `server.ts` with:

```ts
// Stateless mode — no session tracking
app.post("/mcp", async (req, res) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // ← stateless
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP POST error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: req.body?.id ?? null,
      });
    }
  }
});

// GET not needed in stateless mode (return 405)
app.get("/mcp", (_req, res) => {
  res.status(405).set("Allow", "POST").send("Method Not Allowed");
});

// DELETE not needed in stateless mode (return 405)
app.delete("/mcp", (_req, res) => {
  res.status(405).set("Allow", "POST").send("Method Not Allowed");
});
```

---

## Step 6: Hono alternative

If you prefer Hono (or are using `react-router-hono-server`), the approach is the same but adapted to Hono's API. The MCP SDK also provides `@modelcontextprotocol/hono` with `createMcpHonoApp()` for convenience.

```bash
npm install @modelcontextprotocol/hono hono
```

**Use Context7 to look up `@modelcontextprotocol/hono` usage** — it provides DNS rebinding protection and JSON body parsing out of the box for Hono-based servers.

The general pattern is: register your `/mcp` route in the Hono app's `configure` callback (before the React Router handler), and use the same `StreamableHTTPServerTransport` / `NodeStreamableHTTPServerTransport` pattern.

---

## Step 7: Security considerations

### DNS rebinding protection

If your MCP server runs on localhost (dev mode), you're vulnerable to DNS rebinding attacks. The MCP SDK provides middleware for this:

```ts
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";

// Add before MCP routes
app.use("/mcp", hostHeaderValidation(["localhost", "127.0.0.1"]));
```

Or if using the Express helper:

```ts
import { createMcpExpressApp } from "@modelcontextprotocol/express";
// This creates an Express app with DNS rebinding protection enabled by default
```

### Origin validation

For production deployments, validate the `Origin` header on all MCP requests:

```ts
app.use("/mcp", (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = ["https://your-app.com"];

  if (origin && !allowedOrigins.includes(origin)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
});
```

### Authentication

For production, you should add authentication. The MCP spec supports OAuth 2.1 at the transport level. **Use Context7 to look up `@modelcontextprotocol/sdk` OAuth/auth provider setup** — the SDK has built-in support for proxy OAuth providers.

A simpler approach for internal tools is Bearer token auth:

```ts
app.use("/mcp", (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token !== process.env.MCP_API_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});
```

---

## Step 8: Testing

### With MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is the easiest way to test:

```bash
npx @modelcontextprotocol/inspector
```

1. Open `http://localhost:6274` in your browser
2. Set Transport Type to **Streamable HTTP**
3. Set URL to `http://localhost:3000/mcp`
4. Click Connect
5. You should see your tools listed — try calling the `hello` tool

### With Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "my-react-router-app": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Restart Claude Desktop. You should see your server's tools available in the conversation.

### With curl

```bash
# Initialize a session
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": { "name": "test", "version": "1.0.0" }
    }
  }'
```

---

## Recap

1. **Install** `@modelcontextprotocol/sdk`, `zod`, and your HTTP framework
2. **Create** `app/mcp-server.ts` — define your tools, resources, prompts
3. **Set up** a custom Express/Hono server with `/mcp` routes for POST, GET, DELETE
4. **Register** the MCP routes BEFORE the React Router catch-all handler
5. **Choose** stateful (session IDs, SSE support) or stateless (simpler, serverless-friendly)
6. **Secure** with DNS rebinding protection, Origin validation, and auth
7. **Test** with MCP Inspector, Claude Desktop, or curl

### Key gotchas

- The MCP routes **must** be registered before the React Router `*` catch-all, or React Router will handle them as page requests
- `express.json()` middleware should be scoped to `/mcp` only — React Router handles its own body parsing
- The TypeScript SDK import paths differ between v1 (`@modelcontextprotocol/sdk/server/...`) and v2 (`@modelcontextprotocol/server`) — check with Context7
- `StreamableHTTPServerTransport` vs `NodeStreamableHTTPServerTransport` naming varies by SDK version — check with Context7
- For serverless deployments, use stateless mode (`sessionIdGenerator: undefined`)
- In production, always enable DNS rebinding protection and Origin header validation
