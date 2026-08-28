import express, { type Response } from "express";
import { createRequestHandler } from "@react-router/express";
import {
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  type OAuthMetadata,
} from "@modelcontextprotocol/server";
import { mcpAuthMetadataRouter, requireBearerAuth } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  getClient,
  getMcpResourceUrl,
  getOAuthIssuerUrl,
  oauthTokenVerifier,
  registerClient,
} from "./oauth.server.js";
import { createMcpServer } from "./server.js";

export interface CreateSiliconHarbourHttpAppOptions {
  includeFrontend?: boolean;
}

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

function oauthError(res: Response, error: unknown) {
  noStore(res);
  const code =
    typeof error === "object" && error && "code" in error ? String(error.code) : "invalid_request";
  const description = error instanceof Error ? error.message : "OAuth request failed";
  res.status(code === "server_error" ? 500 : 400).json({ error: code, error_description: description });
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

  app.post("/oauth/register", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      noStore(res);
      res.status(201).json(await registerClient(req.body));
    } catch (error) {
      oauthError(res, error);
    }
  });

  app.post("/oauth/token", express.urlencoded({ extended: false, limit: "32kb" }), async (req, res) => {
    try {
      const resourceValue = String(req.body.resource || "");
      if (resourceValue !== resource.toString()) throw new Error("Invalid OAuth resource");
      const clientId = String(req.body.client_id || "");
      if (!(await getClient(clientId))) throw new Error("Invalid OAuth client");
      let tokens;
      if (req.body.grant_type === "authorization_code") {
        tokens = await exchangeAuthorizationCode({
          code: String(req.body.code || ""), clientId,
          redirectUri: String(req.body.redirect_uri || ""),
          codeVerifier: String(req.body.code_verifier || ""), resource: resourceValue,
        });
      } else if (req.body.grant_type === "refresh_token") {
        tokens = await exchangeRefreshToken({
          refreshToken: String(req.body.refresh_token || ""), clientId, resource: resourceValue,
        });
      } else throw new Error("Unsupported grant type");
      noStore(res);
      res.json(tokens);
    } catch (error) {
      oauthError(res, error);
    }
  });

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
