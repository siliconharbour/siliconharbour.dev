import type { AuthInfo } from "@modelcontextprotocol/server";

export interface OperationContext {
  actor: { userId: number; role: "admin" | "regular"; via: "admin-ui" | "mcp" } | null;
  scopes: ReadonlySet<"read" | "write">;
  now: () => Date;
}

export function publicContext(): OperationContext {
  return { actor: null, scopes: new Set(["read"]), now: () => new Date() };
}

export function adminContext(
  userId: number,
  via: "admin-ui" | "mcp" = "admin-ui",
): OperationContext {
  return {
    actor: { userId, role: "admin", via },
    scopes: new Set(["read", "write"]),
    now: () => new Date(),
  };
}

export function mcpContext(auth?: AuthInfo): OperationContext {
  const context = publicContext();
  if (!auth) return context;
  const userId = Number(auth.extra?.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) return context;
  return {
    ...context,
    actor: { userId, role: auth.extra?.role === "admin" ? "admin" : "regular", via: "mcp" },
    scopes: new Set(auth.scopes.includes("mcp:write") ? ["read", "write"] : ["read"]),
  };
}
