import { describe, expect, it } from "vitest";
import { createMcpServer } from "~/mcp/server";

async function runQuery(code: string) {
  const server = await createMcpServer(false);
  // Private test-only access to the registered MCP tool handler.
  // @ts-expect-error private test hook
  const handler = server._registeredTools.query.handler as (args: { code: string }) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
  return handler({ code });
}

async function runExecute(code: string) {
  const server = await createMcpServer(true);
  // @ts-expect-error private test hook
  const handler = server._registeredTools.execute.handler as (args: { code: string }) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
  return handler({ code });
}

describe("MCP query tool", () => {
  it("only exposes execute when write access is granted", async () => {
    const readOnly = await createMcpServer(false);
    const writable = await createMcpServer(true);
    // Private test-only registry access keeps this assertion at the tool-definition boundary.
    // @ts-expect-error private test hook
    expect(Object.keys(readOnly._registeredTools)).toEqual(["search", "query"]);
    // @ts-expect-error private test hook
    expect(Object.keys(writable._registeredTools)).toEqual(["search", "query", "execute"]);
  });

  it("returns JSON text for a trivial expression", async () => {
    const result = await runQuery("return 1");
    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toMatchObject({ ok: true, value: 1, toolCalls: [] });
  });

  it("can call siliconharbour tools and return data", async () => {
    const result = await runQuery("return await tools.siliconharbour.companies({ limit: 1 });");
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text).value as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    if (parsed.length > 0) {
      expect(typeof (parsed[0] as { name?: unknown }).name).toBe("string");
    }
  });

  it("cannot smuggle a mutation helper through the public query sandbox", async () => {
    const result = await runQuery(
      'return await tools.siliconharbour.createEntity({ type: "company", name: "Unauthorized MCP Company" });',
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("createEntity");
  });

  it("creates, updates, and retrieves an entity through authenticated CodeMode", async () => {
    const result = await runExecute(`
      const created = await tools.siliconharbour.createEntity({ type: "person", name: "CodeMode Person", bio: "Before" });
      await tools.siliconharbour.updateEntity({ type: "person", id: created.entity.id, bio: "After" });
      return await tools.siliconharbour.getEntity({ type: "person", by: "id", value: created.entity.id });
    `);
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
  });

  it("accepts object inputs for background sync lookups", async () => {
    const result = await runExecute(
      'return await tools.siliconharbour.getAsyncSync({ runId: "missing" });',
    );
    expect(result.isError, result.content[0].text).toBe(false);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      ok: true,
      value: { found: false, runId: "missing" },
    });
  });
});
