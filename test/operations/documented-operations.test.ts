import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { operationCatalog } from "~/operations/catalog";

it("keeps explicitly documented MCP operation names in the catalog", () => {
  const files = [
    "README.md",
    ...readdirSync("docs")
      .filter((name) => name.endsWith(".md"))
      .map((name) => `docs/${name}`),
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(
      /tools\.siliconharbour\.([a-zA-Z][a-zA-Z0-9]*)\s*\(|MCP operation\s+`([a-zA-Z][a-zA-Z0-9]*)`/g,
    ))
      expect(operationCatalog, `${file}: ${match[1] ?? match[2]}`).toHaveProperty(
        match[1] ?? match[2],
      );
  }
});
