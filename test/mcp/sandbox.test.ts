import { describe, expect, it } from "vitest";
import { formatSandboxError } from "~/mcp/sandbox";

describe("formatSandboxError", () => {
  it("keeps object error details instead of returning [object Object]", () => {
    expect(formatSandboxError({ message: "boom", code: "E_BOOM" })).toContain("boom");
    expect(formatSandboxError({ message: "boom", code: "E_BOOM" })).toContain("E_BOOM");
  });

  it("serializes plain objects without message-like fields", () => {
    expect(formatSandboxError({ reason: "missing apiToken" })).toBe('{\n  "reason": "missing apiToken"\n}');
  });
});
