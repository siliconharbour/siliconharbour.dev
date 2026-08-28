import express, { type Request as ExpressRequest, type Response } from "express";
import { createRequestHandler } from "@react-router/express";
import {
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  type OAuthMetadata,
} from "@modelcontextprotocol/server";
import { mcpAuthMetadataRouter, requireBearerAuth } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { getOptionalUser } from "~/lib/session.server";
import {
  createAuthorizationCode,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  getClient,
  getMcpResourceUrl,
  getOAuthIssuerUrl,
  oauthTokenVerifier,
  registerClient,
  validateScopes,
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

function asWebRequest(req: ExpressRequest): Request {
  return new Request(new URL(req.originalUrl, getOAuthIssuerUrl()), {
    method: req.method,
    headers: req.headers as HeadersInit,
  });
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function validatedAuthorizationRequest(req: ExpressRequest, role: "regular" | "admin") {
  const source = req.method === "GET" ? req.query : req.body;
  const value = (name: string) => String(source[name] || "");
  const clientId = value("client_id");
  const redirectUri = value("redirect_uri");
  const client = await getClient(clientId);
  const resource = value("resource");
  const codeChallenge = value("code_challenge");
  if (!client || !client.redirectUris.includes(redirectUri)) throw new Error("Invalid OAuth client or redirect URI");
  if (value("response_type") !== "code") throw new Error("Only the authorization code flow is supported");
  if (value("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    throw new Error("PKCE with the S256 challenge method is required");
  }
  if (resource !== getMcpResourceUrl().toString()) throw new Error("Invalid OAuth resource");
  return {
    client,
    clientId,
    redirectUri,
    resource,
    codeChallenge,
    scopes: validateScopes(value("scope"), role),
    state: value("state"),
  };
}

function authorizePage(clientName: string, scopes: string[], fields: Record<string, string>) {
  const hidden = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
  const scopeRows = scopes
    .map((scope) => `<div class="scope">${scope === "mcp:write" ? "Review and change site data" : "Search and read site data"}</div>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize MCP access</title><style>body{margin:0;background:#f8faf9;color:#183c35;font:16px system-ui,sans-serif}.wrap{max-width:32rem;margin:12vh auto;padding:1.5rem}.card{background:white;border:1px solid #b8cdc7;padding:1.5rem}h1{margin:0 0 1rem;font-size:1.5rem}p{line-height:1.5}.scope{border-top:1px solid #dce7e3;padding:.75rem 0}.actions{display:flex;gap:.75rem;margin-top:1.25rem}button{border:1px solid #276b5d;padding:.65rem 1rem;font:inherit;cursor:pointer}.allow{background:#276b5d;color:white}.deny{background:white;color:#276b5d}</style></head><body><main class="wrap"><section class="card"><h1>Authorize MCP access</h1><p><strong>${escapeHtml(clientName)}</strong> wants to connect to siliconharbour.dev.</p>${scopeRows}<form method="post" action="/oauth/authorize">${hidden}<div class="actions"><button class="allow" name="decision" value="allow">Allow access</button><button class="deny" name="decision" value="deny">Deny</button></div></form></section></main></body></html>`;
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

  app.use("/oauth/authorize", express.urlencoded({ extended: false, limit: "32kb" }));
  app.get("/oauth/authorize", async (req, res) => {
    const user = await getOptionalUser(asWebRequest(req));
    if (!user) {
      res.redirect(`/manage/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
      return;
    }
    try {
      const auth = await validatedAuthorizationRequest(req, user.user.role);
      noStore(res);
      const fields = Object.fromEntries(
        ["client_id", "redirect_uri", "response_type", "scope", "state", "code_challenge", "code_challenge_method", "resource"]
          .map((name) => [name, String(req.query[name] || "")]),
      );
      res.type("html").send(authorizePage(auth.client.name, auth.scopes, fields));
    } catch (error) {
      oauthError(res, error);
    }
  });

  app.post("/oauth/authorize", async (req, res) => {
    const user = await getOptionalUser(asWebRequest(req));
    if (!user) return void res.status(401).send("Your login session has expired");
    try {
      const auth = await validatedAuthorizationRequest(req, user.user.role);
      const destination = new URL(auth.redirectUri);
      if (req.body.decision !== "allow") destination.searchParams.set("error", "access_denied");
      else destination.searchParams.set("code", await createAuthorizationCode({
        userId: user.user.id,
        clientId: auth.clientId,
        redirectUri: auth.redirectUri,
        scopes: auth.scopes,
        codeChallenge: auth.codeChallenge,
        resource: auth.resource,
      }));
      if (auth.state) destination.searchParams.set("state", auth.state);
      res.redirect(destination.toString());
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
