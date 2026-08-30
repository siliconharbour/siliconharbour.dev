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
    const result = await runQuery("export default 1");
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("1");
  });

  it("can import siliconharbour helpers and return data", async () => {
    const result = await runQuery(
      'import { companies } from "siliconharbour"; export default await companies({ limit: 1 });',
    );
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    if (parsed.length > 0) {
      expect(typeof (parsed[0] as { name?: unknown }).name).toBe("string");
    }
  });

  it("cannot smuggle a mutation helper through the public query sandbox", async () => {
    const result = await runQuery(
      'import { createEntity } from "siliconharbour"; export default await createEntity({ type: "company", name: "Unauthorized MCP Company" });',
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("createEntity");
  });
});
