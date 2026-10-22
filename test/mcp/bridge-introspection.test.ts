import { expect, it } from "vitest";
import { operationCatalog } from "~/operations/catalog";
import { buildReadFunctions, buildExecuteFunctions } from "~/mcp/bridge";
import { adminContext, publicContext } from "~/operations/context";
import { searchOperations, searchSpec } from "~/mcp/search";
import { createCodeMode, EXECUTE_LIMITS } from "~/mcp/code-mode";
import { describeRuntime } from "~/mcp/server";

it("generates query and execute bindings from the catalog", () => {
  const context = adminContext(1);
  const catalog = Object.keys(operationCatalog);
  const execute = buildExecuteFunctions(context);
  const read = buildReadFunctions(context);
  expect(Object.keys(execute).sort()).toEqual(
    catalog.sort(),
  );
  expect(Object.keys(read).sort()).toEqual(
    [
      ...catalog.filter(
        (name) => operationCatalog[name as keyof typeof operationCatalog].risk === "read",
      ),
    ].sort(),
  );
  for (const [name, fn] of Object.entries(buildReadFunctions(publicContext())))
    expect(fn.doc.risk, name).toBe("read");
  expect(buildReadFunctions(publicContext())).not.toHaveProperty("newsletterSubscriberList");
});
it("finds task semantics, field names, and products/projects without hard-coded entity hints", () => {
  const context = adminContext(1);
  expect(searchOperations("cancel occurrence", context)[0].operation.name).toBe(
    "eventOccurrenceCancel",
  );
  expect(searchSpec("companyUpdate", context)).toContain("careersUrl");
  expect(searchSpec("companyUpdate", context)).toContain('"additionalProperties": false');
  expect(searchSpec("projectList", context)).toContain("projectList");
  expect(searchSpec("productList", context)).toContain("productList");
  expect(searchOperations("newsletter", publicContext())).toEqual([]);
  expect(searchSpec("imageUploadPrepare", context)).toContain("upload-only");
});
it("keeps runtime descriptions within budget without cutting a signature", () => {
  const functions = buildExecuteFunctions(adminContext(1));
  const runtime = createCodeMode(functions);
  const description = describeRuntime(runtime, EXECUTE_LIMITS, functions);
  expect(description.length).toBeLessThanOrEqual(8000);
  expect(description).toContain("Areas:");
  expect(description).toContain("confirm: true");
  const entries = runtime.catalog().filter((tool) => description.includes(tool.signature));
  expect(entries.length).toBeGreaterThan(0);
});
