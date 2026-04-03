// Stub — full implementation in Task 6
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "siliconharbour",
    version: "1.0.0",
  });
  return server;
}
