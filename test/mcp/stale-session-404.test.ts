import { afterEach, describe, expect, it } from "vitest";
import { createSiliconHarbourHttpApp } from "~/mcp/http-app";

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

describe("Silicon Harbour MCP stale session handling", () => {
  let server: Awaited<ReturnType<typeof startTestServer>>["server"] | undefined;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
    server = undefined;
  });

  it("returns 404 for POST requests with an unknown session id", async () => {
    const started = await startTestServer();
    server = started.server;

    const response = await fetch(`${started.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Mcp-Session-Id": "stale-session-id",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Session not found" },
      id: 1,
    });
  });

  it("returns 404 for GET requests with an unknown session id", async () => {
    const started = await startTestServer();
    server = started.server;

    const response = await fetch(`${started.baseUrl}/mcp`, {
      method: "GET",
      headers: {
        "Mcp-Session-Id": "stale-session-id",
      },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Session not found" },
      id: null,
    });
  });
});
