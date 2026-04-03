import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
    .map(([method, op]) => `  ${method.toUpperCase()} ${path}${op.summary ? ` — ${op.summary}` : ""}`)
    .join("\n");
}

const MODULE_HINTS: Record<string, string> = {
  event: "siliconharbour module: events({ limit?, offset?, upcoming? })",
  job: "siliconharbour module: jobs({ limit?, offset?, query? })",
  company: "siliconharbour module: companies({ limit?, offset?, query? })",
  group: "siliconharbour module: groups({ limit?, offset? })",
  person: "siliconharbour module: people({ limit?, offset?, query? })",
  people: "siliconharbour module: people({ limit?, offset?, query? })",
  education: "siliconharbour module: education({ limit?, offset? })",
  technology: "siliconharbour module: technologies({ limit?, offset? })",
  product: "siliconharbour module: (no dedicated function — query companies instead)",
  project: "siliconharbour module: (no dedicated function — query companies instead)",
};

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

  if (results.length === 0) {
    return [
      `No matches for "${query}".`,
      "Available entities: event, job, company, group, person, education, technology, product, project, news",
      "For all module functions: search('siliconharbour module')",
    ].join("\n");
  }

  const hint = Object.entries(MODULE_HINTS).find(([k]) => q.includes(k))?.[1];

  const parts = [results.slice(0, 6).join("\n\n")];
  if (hint) parts.push(`\nUsage in query/execute tool:\nimport { ... } from 'siliconharbour'\n${hint}`);

  return parts.join("").trim();
}
