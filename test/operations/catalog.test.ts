import { describe, expect, it } from "vitest";
import { z } from "zod";
import { operationCatalog } from "~/operations/catalog";
import { catalogHostFunctions } from "~/mcp/catalog-host";
import { adminContext, publicContext } from "~/operations/context";
import { ForbiddenError, ConfirmationRequiredError } from "~/operations/errors";
import { updateContract, nullableText, text } from "~/operations/fields";

for (const [name, operation] of Object.entries(operationCatalog)) {
  describe(name, () => {
    it("rejects unknown input and documents a valid example", () => {
      expect(name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      expect(operation.summary.length).toBeGreaterThan(0);
      expect(operation.description.length).toBeGreaterThan(0);
      const example = operation.examples[0].input;
      expect(operation.input.safeParse(example).success).toBe(true);
      expect(operation.input.safeParse({ ...example, __unknown: 1 }).success).toBe(false);
    });
    it("enforces admin access inside the operation", async () => {
      await expect(
        operation.execute(publicContext(), operation.examples[0].input),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
    if (operation.risk === "destructive" || operation.risk === "external") {
      it("requires explicit confirmation", async () => {
        await expect(operation.execute(adminContext(1), {})).rejects.toBeInstanceOf(
          ConfirmationRequiredError,
        );
      });
    }
  });
}

it("does not expose administrative reads to anonymous clients", () => {
  expect(catalogHostFunctions(publicContext(), true)).toEqual({});
  expect(Object.keys(catalogHostFunctions(adminContext(1)))).toEqual(Object.keys(operationCatalog));
  expect(Object.keys(catalogHostFunctions(adminContext(1), true))).toEqual(
    Object.keys(operationCatalog).filter(
      (name) => operationCatalog[name as keyof typeof operationCatalog].risk === "read",
    ),
  );
});

it("distinguishes absent patches, required text, and nullable text", () => {
  const contract = updateContract({
    title: text("title").optional(),
    location: nullableText().optional(),
  });
  expect(() => contract.parse({ id: 1 })).toThrow("No fields to update");
  expect(() => contract.parse({ id: 1, title: "  " })).toThrow("title is required");
  expect(contract.parse({ id: 1, location: "  " })).toEqual({ id: 1, location: null });
  expect(() => contract.parse({ id: 1, bogus: 1 })).toThrow(z.ZodError);
});

it("does not permit direct construction of a write runtime for anonymous or read-only actors", async () => {
  const { buildExecuteFunctions, buildReadFunctions } = await import("~/mcp/bridge");
  expect(() => buildExecuteFunctions(publicContext())).toThrow(ForbiddenError);
  const readOnly = { ...adminContext(1), scopes: new Set<"read" | "write">(["read"]) };
  expect(() => buildExecuteFunctions(readOnly)).toThrow(ForbiddenError);
  await expect(buildReadFunctions().jobs({ status: "all" })).rejects.toThrow(ForbiddenError);
});

it("derives read and write access from the granted MCP scopes", async () => {
  const { mcpContext } = await import("~/operations/context");
  const auth = { token: "test", clientId: "test", scopes: [], extra: { userId: 1, role: "admin" } };
  const context = mcpContext(auth);
  expect(catalogHostFunctions(context)).toEqual({});
  await expect(operationCatalog.themeShareList.execute(context, {})).rejects.toThrow(
    "Read scope required",
  );
  expect([...mcpContext({ ...auth, scopes: ["mcp:write"] }).scopes]).toEqual(["write"]);
});
