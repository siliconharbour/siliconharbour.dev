import { describe, expect, it } from "vitest";
import { createMcpServer } from "~/mcp/server";

async function callTool(name: "query" | "execute", code: string) {
  const server = await createMcpServer(name === "execute");
  // @ts-expect-error private SDK registry
  const handler = server._registeredTools[name].handler as (args: { code: string }) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
  return handler({ code });
}

describe("MCP Code Mode tools", () => {
  it("cannot smuggle a mutation helper through the public query", async () => {
    const result = await callTool(
      "query",
      'return await tools.siliconharbour.createEntity({ type: "company", name: "Unauthorized MCP Company" });',
    );

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      ok: false,
      error: { kind: "UnknownTool" },
      toolCalls: [],
    });
  });

  it("creates, updates, and retrieves an entity through authenticated Code Mode", async () => {
    const result = await callTool(
      "execute",
      `
      const created = await tools.siliconharbour.createEntity({ type: "person", name: "CodeMode Person", bio: "Before" });
      await tools.siliconharbour.updateEntity({ type: "person", id: created.entity.id, bio: "After" });
      return await tools.siliconharbour.getEntity({ type: "person", by: "id", value: created.entity.id });
    `,
    );
    expect(result.isError, result.content[0].text).toBe(false);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      ok: true,
      value: { found: true, entity: { name: "CodeMode Person", bio: "After", visible: false } },
      toolCalls: [
        { name: "siliconharbour.createEntity" },
        { name: "siliconharbour.updateEntity" },
        { name: "siliconharbour.getEntity" },
      ],
    });
    const publicResult = await callTool("query", "return await tools.siliconharbour.people({});");
    expect(publicResult.isError).toBe(false);
    expect(JSON.parse(publicResult.content[0].text)).toMatchObject({ ok: true, value: [] });
  });

  it("accepts object inputs for background sync lookups", async () => {
    const result = await callTool(
      "execute",
      'return await tools.siliconharbour.getAsyncSync({ runId: "missing" });',
    );
    expect(result.isError, result.content[0].text).toBe(false);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      ok: true,
      value: { found: false, runId: "missing" },
    });
  });
});
