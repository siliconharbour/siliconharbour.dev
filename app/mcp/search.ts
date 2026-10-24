import { closestNames } from "~/lib/name-suggestions";
import { readFileSync } from "node:fs";
import { operationCatalog } from "~/operations/catalog";
import { publicContext, type OperationContext } from "~/operations/context";
import { z } from "zod";
import { schemaFields, schemaType, type JsonSchema } from "./schema-docs";
const entries = Object.values(operationCatalog).map((operation) => {
  const input = z.toJSONSchema(operation.input, { io: "input", unrepresentable: "any" });
  const output = z.toJSONSchema(operation.output, { io: "output", unrepresentable: "any" });
  return {
    operation,
    input,
    output,
    words: {
      name: words(operation.name),
      area: words(operation.area),
      summary: words(operation.summary),
      description: words(operation.description),
      examples: words(operation.examples.map((example) => example.title).join(" ")),
      fields: words(
        [...schemaFields(input as JsonSchema), ...schemaFields(output as JsonSchema)].join(" "),
      ),
    },
  };
});
function words(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => (word.endsWith("s") ? word.slice(0, -1) : word));
}
const stopWords = new Set([
  "a",
  "an",
  "the",
  "to",
  "and",
  "how",
  "can",
  "i",
  "show",
  "me",
  "all",
  "operation",
  "tool",
  "field",
  "schema",
  "siliconharbour",
]);
export function searchOperations(query: string, context: OperationContext = publicContext()) {
  const tokens = words(query).filter((word) => !stopWords.has(word));
  const visible = entries.filter(
    ({ operation }) =>
      (operation.access === "public" || context.actor?.role === "admin") &&
      context.scopes.has(operation.risk === "read" ? "read" : "write"),
  );
  const nearby = !/\s/.test(query.trim())
    ? closestNames(
        query.trim(),
        visible.map((entry) => entry.operation.name),
      )
    : [];
  return visible
    .map((entry) => {
      let score = entry.operation.name.toLowerCase() === query.toLowerCase().trim() ? 1000 : 0;
      if (nearby.includes(entry.operation.name))
        score += 200 - nearby.indexOf(entry.operation.name);
      for (const token of tokens)
        for (const [field, weight] of [
          ["name", 16],
          ["area", 10],
          ["summary", 8],
          ["description", 2],
          ["examples", 4],
          ["fields", 4],
        ] as const)
          if (entry.words[field].some((word) => word === token)) score += weight;
      if (tokens.length && tokens.every((token) => entry.words.name.includes(token))) score += 40;
      if (
        tokens.length &&
        tokens.every((token) => Object.values(entry.words).some((list) => list.includes(token)))
      )
        score += 20;
      return { ...entry, score };
    })
    .filter((entry) => entry.score > 0 || tokens.length === 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.operation.area.localeCompare(b.operation.area) ||
        a.operation.name.localeCompare(b.operation.name),
    );
}
function operationText(entry: (typeof entries)[number], full: boolean) {
  const { operation, input, output } = entry;
  return [
    `### tools.siliconharbour.${operation.name}`,
    operation.summary,
    operation.description,
    `Area: ${operation.area}. Access: ${operation.access}. Risk: ${operation.risk}.`,
    `${operation.name}(input: ${schemaType(input as JsonSchema)}): Promise<${schemaType(output as JsonSchema)}>`,
    ...operation.examples
      .slice(0, 1)
      .map((example) => `Example: ${operation.name}(${JSON.stringify(example.input)})`),
    ...(full ? [`Input JSON Schema:\n${JSON.stringify(input, null, 2)}`] : []),
  ].join("\n");
}
let publicSpec: unknown;
function publicApiMatches(query: string) {
  publicSpec ??= JSON.parse(
    readFileSync(new URL("../../public/openapi.json", import.meta.url), "utf8"),
  );
  const spec = publicSpec as { components?: { schemas?: Record<string, JsonSchema> } };
  return Object.entries(spec.components?.schemas ?? {})
    .filter(([name]) => name.toLowerCase() === query.toLowerCase().trim())
    .map(([name, schema]) => `### Public REST schema: ${name}\n${schemaType(schema)}`)
    .join("\n");
}
export function searchSpec(query: string, context: OperationContext = publicContext()): string {
  const matches = searchOperations(query, context);
  if (!matches.length)
    return (
      publicApiMatches(query) ||
      `No matching operations for ${JSON.stringify(query)}. Available areas: ${[...new Set(searchOperations("", context).map((entry) => entry.operation.area))].join(", ")}. Search an area or an operation name.`
    );
  if (!words(query).some((word) => !stopWords.has(word))) {
    const areas = new Map<string, string[]>();
    for (const { operation } of matches)
      areas.set(operation.area, [...(areas.get(operation.area) ?? []), operation.name]);
    return [...areas].map(([area, names]) => `${area}: ${names.join(", ")}`).join("\n");
  }
  const parts: string[] = [];
  let size = 0;
  for (const entry of matches.slice(0, 8)) {
    const full = entry.operation.name.toLowerCase() === query.trim().toLowerCase();
    const text = operationText(entry, full);
    if (parts.length && size + text.length > 16000) break;
    parts.push(text);
    size += text.length;
  }
  return parts.join("\n\n");
}
