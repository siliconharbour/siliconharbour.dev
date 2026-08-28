import express from "express";
import { createRequestHandler } from "@react-router/express";
import {
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  type OAuthMetadata,
} from "@modelcontextprotocol/server";
import { mcpAuthMetadataRouter, requireBearerAuth } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { getMcpResourceUrl, getOAuthIssuerUrl, oauthTokenVerifier } from "./oauth.server.js";
import { createMcpServer } from "./server.js";

export interface CreateSiliconHarbourHttpAppOptions {
  includeFrontend?: boolean;
}

export async function createSiliconHarbourHttpApp(options: CreateSiliconHarbourHttpAppOptions = {}) {
  const { includeFrontend = true } = options;
  const app = express();
  const issuer = getOAuthIssuerUrl();
  const resource = getMcpResourceUrl();
  const oauthMetadata: OAuthMetadata = {
    issuer: issuer.toString().replace(/\/$/, ""),
    authorization_endpoint: new URL("/oauth/authorize", issuer).toString(),
    token_endpoint: new URL("/oauth/token", issuer).toString(),
    registration_endpoint: new URL("/oauth/register", issuer).toString(),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp:read", "mcp:write"],
  };

  app.use(mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl: resource,
    scopesSupported: ["mcp:read", "mcp:write"],
    resourceName: "Silicon Harbour MCP",
    dangerouslyAllowInsecureIssuerUrl: process.env.NODE_ENV !== "production",
  }));

  app.use("/mcp", express.json());
  app.use("/mcp", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Authorization");
    if (req.method === "OPTIONS") return void res.sendStatus(204);
    next();
  });
  app.use("/mcp", requireBearerAuth({
    verifier: oauthTokenVerifier,
    requiredScopes: ["mcp:read"],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource),
  }));
  app.use("/mcp", (req, res, next) => {
    if (req.method === "GET" || req.method === "DELETE") {
      res.status(405).set("Allow", "POST").send("Method Not Allowed");
      return;
    }
    next();
  });
  const mcpHandler = createMcpHandler(
    (context) => createMcpServer(context.authInfo?.scopes.includes("mcp:write") ?? false),
    { legacy: "stateless", onerror: (error) => console.error("MCP error:", error) },
  );
  const nodeMcpHandler = toNodeHandler(mcpHandler, { onerror: (error) => console.error("MCP HTTP error:", error) });
  app.all("/mcp", (req, res) => void nodeMcpHandler(req, res, req.body));

  if (includeFrontend) {
    const viteDevServer = process.env.NODE_ENV === "production" ? undefined : await import("vite").then((vite) =>
      vite.createServer({ server: { host: "127.0.0.1", middlewareMode: true, hmr: { host: "127.0.0.1" } } }),
    );
    if (viteDevServer) app.use(viteDevServer.middlewares);
    else app.use(express.static("build/client"));
    app.all("/{*path}", createRequestHandler({
      build: viteDevServer ? () => viteDevServer.ssrLoadModule("virtual:react-router/server-build") :
        // @ts-expect-error — build output
        await import("../../build/server/index.js"),
    }));
  }
  return app;
}
