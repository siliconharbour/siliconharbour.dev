import { expect, it } from "vitest";
import { z } from "zod";
import { operationCatalog } from "~/operations/catalog";
import { catalogHostFunctions } from "~/mcp/catalog-host";
import { adminContext, publicContext } from "~/operations/context";
import { ForbiddenError, ConfirmationRequiredError } from "~/operations/errors";
import { updateContract, nullableText, text } from "~/operations/fields";

it("documents valid examples and rejects unknown keys throughout input objects", () => {
  function strictObjects(value: unknown, name: string) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const child of value) strictObjects(child, name);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === "object") expect(node.additionalProperties, name).toBe(false);
    for (const child of Object.values(node)) strictObjects(child, name);
  }
  for (const [name, operation] of Object.entries(operationCatalog)) {
    expect(operation.name).toBe(name);
    expect(name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    expect(operation.summary.trim().length, name).toBeGreaterThan(0);
    expect(operation.description.trim().length, name).toBeGreaterThan(0);
    const example = operation.examples[0].input;
    expect(operation.input.safeParse(example).success, name).toBe(true);
    expect(operation.input.safeParse({ ...example, __unknown: 1 }).success, name).toBe(false);
    strictObjects(z.toJSONSchema(operation.input, { io: "input", unrepresentable: "any" }), name);
  }
});
it("enforces administrator access and scopes before any operation runs", async () => {
  for (const operation of Object.values(operationCatalog)) {
    if (operation.access === "admin")
      await expect(
        operation.execute(publicContext(), operation.examples[0].input),
        operation.name,
      ).rejects.toBeInstanceOf(ForbiddenError);
    const noScopes = { ...adminContext(1), scopes: new Set<"read" | "write">() };
    await expect(
      operation.execute(noScopes, operation.examples[0].input),
      operation.name,
    ).rejects.toBeInstanceOf(ForbiddenError);
  }
});
it("requires confirmation on every destructive or external operation", async () => {
  for (const operation of Object.values(operationCatalog))
    if (operation.risk === "destructive" || operation.risk === "external")
      await expect(operation.execute(adminContext(1), {}), operation.name).rejects.toBeInstanceOf(
        ConfirmationRequiredError,
      );
});

it("does not expose administrative reads to anonymous clients", () => {
  expect(Object.keys(catalogHostFunctions(publicContext(), true))).toEqual(
    Object.values(operationCatalog)
      .filter((operation) => operation.access === "public" && operation.risk === "read")
      .map((operation) => operation.name),
  );
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
  expect(buildReadFunctions()).not.toHaveProperty("jobList");
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

it("labels examples that clear nullable settings in destructive or replacement operations", () => {
  function nullFields(value: unknown, path = ""): string[] {
    if (value === null) return [path];
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, child]) =>
      nullFields(child, path ? `${path}.${key}` : key),
    );
  }
  for (const op of Object.values(operationCatalog)) {
    if (op.risk !== "destructive" && !/replace/i.test(op.description)) continue;
    for (const example of op.examples) {
      const cleared = nullFields(example.input);
      if (cleared.length)
        expect(example.title, `${op.name} clears ${cleared.join(", ")}`).toMatch(/clear/i);
    }
  }
});
