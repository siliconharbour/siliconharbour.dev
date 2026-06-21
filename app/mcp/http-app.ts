import express from "express";
import { createRequestHandler } from "@react-router/express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";

export interface CreateSiliconHarbourHttpAppOptions {
  includeFrontend?: boolean;
}

export async function createSiliconHarbourHttpApp(
  options: CreateSiliconHarbourHttpAppOptions = {},
) {
  const { includeFrontend = true } = options;
  const app = express();

  // MCP endpoint, must be registered BEFORE the React Router catch-all.
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

  app.post("/mcp", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
      const authenticated = !!(process.env.MCP_API_TOKEN && token === process.env.MCP_API_TOKEN);
      const server = await createMcpServer(authenticated);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
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

  app.get("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").send("Method Not Allowed");
  });

  app.delete("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").send("Method Not Allowed");
  });

  if (includeFrontend) {
    const viteDevServer =
      process.env.NODE_ENV === "production"
        ? undefined
        : await import("vite").then((vite) =>
            vite.createServer({
              server: {
                host: "127.0.0.1",
                middlewareMode: true,
                hmr: { host: "127.0.0.1" },
              },
            }),
          );

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
            await import("../../build/server/index.js"),
      }),
    );
  }

  return app;
}
