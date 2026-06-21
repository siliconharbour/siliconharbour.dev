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
    const started = await startTestServer();
    server = started.server;

    const response = await fetch(`${started.baseUrl}/mcp`, {
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
          clientInfo: { name: "vitest", version: "1.0.0" },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
  });

  it("returns 405 for GET and DELETE requests", async () => {
    const started = await startTestServer();
    server = started.server;

    for (const method of ["GET", "DELETE"] as const) {
      const response = await fetch(`${started.baseUrl}/mcp`, {
        method,
        headers: {
          "Mcp-Session-Id": "stale-session-id",
        },
      });

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      await expect(response.text()).resolves.toContain("Method Not Allowed");
    }
  });
});
