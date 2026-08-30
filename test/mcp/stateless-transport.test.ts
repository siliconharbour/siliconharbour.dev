import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createSiliconHarbourHttpApp } from "~/mcp/http-app";
import { db } from "~/db";
import { oauthClients, oauthTokens, users } from "~/db/schema";

async function createAccessToken(
  scopes = "mcp:read",
  role: "regular" | "admin" = "admin",
) {
  const token = `test-access-token-${role}-${scopes.replaceAll(" ", "-")}`;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}-${crypto.randomUUID()}@example.com`, passwordHash: "unused", role })
    .returning();
  await db.insert(oauthClients).values({
    id: "test-client",
    name: "Vitest",
    redirectUris: '["http://127.0.0.1/callback"]',
  });
  await db.insert(oauthTokens).values({
    tokenHash: createHash("sha256").update(token).digest("hex"),
    tokenType: "access",
    userId: user.id,
    clientId: "test-client",
    familyId: "test-family",
    scopes,
    resource: "http://localhost:3000/mcp",
    expiresAt: new Date(Date.now() + 60_000),
  });
  return token;
}

async function startTestServer() {
  const app = await createSiliconHarbourHttpApp({ includeFrontend: false });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP port");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function parseMcpResponse(response: Response) {
  const responseText = await response.text();
  const dataLine = responseText.split("\n").find((line) => line.startsWith("data: "));
  return JSON.parse(dataLine ? dataLine.slice(6) : responseText);
}

describe("Silicon Harbour MCP stateless transport", () => {
  let server: Awaited<ReturnType<typeof startTestServer>>["server"] | undefined;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
    server = undefined;
  });

  it("does not mint an MCP session id during initialize", async () => {
    const token = await createAccessToken();
    const started = await startTestServer();
    server = started.server;

    const response = await fetch(`${started.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "vitest", version: "1.0.0" },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
  });

  it("returns 405 for GET and DELETE requests", async () => {
    const token = await createAccessToken();
    const started = await startTestServer();
    server = started.server;

    for (const method of ["GET", "DELETE"] as const) {
      const response = await fetch(`${started.baseUrl}/mcp`, {
        method,
        headers: {
          "Mcp-Session-Id": "stale-session-id",
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      await expect(response.text()).resolves.toContain("Method Not Allowed");
    }
  });

  it("allows unauthenticated clients to initialize and use public tools", async () => {
    const started = await startTestServer();
    server = started.server;
    const initialize = await fetch(`${started.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "vitest-public", version: "1.0.0" },
        },
      }),
    });
    expect(initialize.status).toBe(200);

    const tools = await fetch(`${started.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(tools.status).toBe(200);
    const body = await parseMcpResponse(tools);
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "search",
      "query",
    ]);
  });

  it.each([
    ["an unauthenticated session", undefined],
    ["a read-only OAuth session", "mcp:read"],
  ])("does not let %s invoke the execute tool", async (_label, scopes) => {
    const token = scopes ? await createAccessToken(scopes) : undefined;
    const started = await startTestServer();
    server = started.server;

    const response = await fetch(`${started.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "execute",
          arguments: {
            code: "export default await createEntity({ type: 'company', name: 'Nope' })",
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = await parseMcpResponse(response);
    expect(body.error).toMatchObject({ code: -32602 });
    expect(body.error.message).toContain("execute");
  });

  it("rejects a forged write-scoped token belonging to a regular account", async () => {
    const token = await createAccessToken("mcp:read mcp:write", "regular");
    const started = await startTestServer();
    server = started.server;

    const response = await fetch(`${started.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("invalid_token");
  });

  it("challenges invalid OAuth credentials with protected resource metadata", async () => {
    const started = await startTestServer();
    server = started.server;
    const response = await fetch(`${started.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid-token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("adds the execute tool for an OAuth session with write access", async () => {
    const token = await createAccessToken("mcp:read mcp:write");
    const started = await startTestServer();
    server = started.server;
    const response = await fetch(`${started.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    expect(response.status).toBe(200);
    const body = await parseMcpResponse(response);
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "search",
      "query",
      "execute",
    ]);
  });

  it("publishes OAuth authorization and protected-resource metadata", async () => {
    const started = await startTestServer();
    server = started.server;
    const [authorization, protectedResource] = await Promise.all([
      fetch(`${started.baseUrl}/.well-known/oauth-authorization-server`),
      fetch(`${started.baseUrl}/.well-known/oauth-protected-resource/mcp`),
    ]);
    expect(await authorization.json()).toMatchObject({
      authorization_endpoint: "http://localhost:3000/oauth/authorize",
      code_challenge_methods_supported: ["S256"],
    });
    expect(await protectedResource.json()).toMatchObject({
      resource: "http://localhost:3000/mcp",
      scopes_supported: ["mcp:read", "mcp:write"],
    });
  });
});
