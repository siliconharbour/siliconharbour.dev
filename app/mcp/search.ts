import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getHostFunctionDocs } from "./bridge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const openapiPath = join(__dirname, "../../public/openapi.json");

type SchemaObject = {
  properties?: Record<string, { type?: string; description?: string; nullable?: boolean }>;
  description?: string;
};

type PathMethods = Record<string, { summary?: string; description?: string }>;

const spec = JSON.parse(readFileSync(openapiPath, "utf-8")) as {
  paths: Record<string, PathMethods>;
  components: { schemas: Record<string, SchemaObject> };
};

function schemaToText(name: string, schema: SchemaObject): string {
  const props = schema.properties ?? {};
  const fields = Object.entries(props)
    .map(([k, v]) => `  ${k}: ${v.type ?? "object"}${v.nullable ? " | null" : ""}`)
    .join("\n");
  return `### ${name}\n${fields || "  (no properties documented)"}`;
}

function endpointToText(path: string, methods: PathMethods): string {
  return Object.entries(methods)
    .filter(([method]) => ["get", "post", "put", "delete", "patch"].includes(method))
    .map(
      ([method, op]) => `  ${method.toUpperCase()} ${path}${op.summary ? ` — ${op.summary}` : ""}`,
    )
    .join("\n");
}

/**
 * Map a search noun → host function name. Mostly the noun pluralised,
 * but some entities (person/people) need an alias and some have no
 * dedicated function. Resolved against the live host-function docs so
 * signatures stay correct as the bridge evolves.
 */
const HOST_FN_NAME_FOR_ENTITY: Record<string, string | null> = {
  event: "events",
  job: "jobs",
  company: "companies",
  group: "groups",
  person: "people",
  people: "people",
  education: "education",
  technology: "technologies",
  news: "news",
  product: null, // no dedicated function — query companies instead
  project: null, // no dedicated function — query companies instead
};

function formatModuleHint(query: string): string | null {
  const docs = getHostFunctionDocs();
  const readByName = new Map(docs.read.map((d) => [d.name, d]));
  const matched = Object.entries(HOST_FN_NAME_FOR_ENTITY).find(([k]) => query.includes(k));
  if (!matched) return null;
  const [, fnName] = matched;
  if (fnName === null) {
    return "siliconharbour module: (no dedicated function — query companies instead)";
  }
  const doc = readByName.get(fnName);
  if (!doc) return null; // function removed from bridge
  return `siliconharbour module: ${doc.signature}\n  ${doc.description}`;
}

export function searchSpec(query: string): string {
  const q = query.toLowerCase();
  const results: string[] = [];

  // Match schemas
  for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
    const text = `${name} ${JSON.stringify(schema)}`.toLowerCase();
    if (text.includes(q)) {
      results.push(schemaToText(name, schema));
    }
  }

  // Match endpoints
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    if (`${path} ${JSON.stringify(methods)}`.toLowerCase().includes(q)) {
      const line = endpointToText(path, methods);
      if (line) results.push(line);
    }
  }

  // Search the host-function docs themselves. Lets agents ask
  // "siliconharbour module" or function-name queries.
  const fnDocs = getHostFunctionDocs();
  const matchingFns = fnDocs.execute.filter(
    (d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
  );
  if (matchingFns.length > 0) {
    results.push(
      "### siliconharbour module functions\n" +
        matchingFns
          .slice(0, 12)
          .map((d) => `  ${d.signature}\n    — ${d.description}`)
          .join("\n"),
    );
  }

  if (results.length === 0) {
    return [
      `No matches for "${query}".`,
      "Available entities: event, job, company, group, person, education, technology, product, project, news",
      "For all module functions: search('siliconharbour module')",
    ].join("\n");
  }

  const hint = formatModuleHint(q);

  const parts = [results.slice(0, 6).join("\n\n")];
  if (hint)
    parts.push(`\nUsage in query/execute tool:\nimport { ... } from 'siliconharbour'\n${hint}`);

  return parts.join("").trim();
}
