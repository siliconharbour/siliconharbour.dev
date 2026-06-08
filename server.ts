import express from "express";
import { createRequestHandler } from "@react-router/express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./app/mcp/server.js";

const app = express();

// ── MCP endpoint ─────────────────────────────────────────────────────
// Must be registered BEFORE the React Router catch-all.
// JSON body parsing scoped to /mcp only — React Router handles its own.

app.use("/mcp", express.json());

// CORS — required for browser-based MCP clients (Claude.ai, MCP Inspector)
app.use("/mcp", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Mcp-Session-Id, Authorization",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId)!.handleRequest(req, res, req.body);
      return;
    }

    // Per the MCP Streamable HTTP spec, if a client sends a non-initialize
    // request with an Mcp-Session-Id that we don't know about (e.g. because
    // the server restarted and the in-memory `transports` map was reset), we
    // MUST respond with HTTP 404. Spec-compliant clients treat 404 as the
    // signal to drop the stale session ID and re-initialize transparently.
    //
    // Returning 400 here (the previous behaviour) leaves the client stuck
    // with an unrecoverable transport and forces a manual reconnect after
    // every redeploy.
    if (sessionId && !transports.has(sessionId)) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found" },
        id: req.body?.id ?? null,
      });
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

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const authenticated = !!(process.env.MCP_API_TOKEN && token === process.env.MCP_API_TOKEN);
    const server = await createMcpServer(authenticated);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };

    await server.connect(transport);

    // Handle the initialize request — this generates the sessionId
    await transport.handleRequest(req, res, req.body);

    // Store transport after handleRequest so sessionId is populated
    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }
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
  if (!sessionId) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Missing session ID" },
    });
    return;
  }
  if (!transports.has(sessionId)) {
    // Stale/unknown session — signal the client to re-initialize.
    res.status(404).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Session not found" },
    });
    return;
  }
  await transports.get(sessionId)!.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Missing session ID" },
    });
    return;
  }
  if (!transports.has(sessionId)) {
    res.status(404).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Session not found" },
    });
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
    : await import("vite").then((vite) => vite.createServer({ server: { middlewareMode: true } }));

if (viteDevServer) {
  app.use(viteDevServer.middlewares);
} else {
  app.use(express.static("build/client"));
}

app.all(
  "/{*path}",
  createRequestHandler({
    build: viteDevServer
      ? () => viteDevServer.ssrLoadModule("virtual:react-router/server-build")
      : // @ts-expect-error — build output
        await import("./build/server/index.js"),
  }),
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
