export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema | boolean>;
  required?: string[];
  items?: JsonSchema | boolean;
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  description?: string;
  format?: string;
  additionalProperties?: boolean | JsonSchema;
};
export function schemaType(schema: JsonSchema | boolean | undefined): string {
  if (!schema || typeof schema === "boolean") return "unknown";
  if ("const" in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) return variants.map(schemaType).join(" | ");
  if (Array.isArray(schema.type))
    return schema.type.map((type) => schemaType({ ...schema, type })).join(" | ");
  if (schema.type === "array") return `Array<${schemaType(schema.items)}>`;
  if (schema.type === "object" || schema.properties) {
    if (!schema.properties && typeof schema.additionalProperties === "object")
      return `Record<string, ${schemaType(schema.additionalProperties)}>`;
    const required = new Set(schema.required);
    return `{ ${Object.entries(schema.properties ?? {})
      .map(
        ([key, value]) =>
          `${JSON.stringify(key)}${required.has(key) ? "" : "?"}: ${schemaType(value)}`,
      )
      .join("; ")} }`;
  }
  return schema.type === "integer" ? "number" : (schema.type ?? "unknown");
}
export function schemaFields(schema: JsonSchema | boolean | undefined): string[] {
  if (!schema || typeof schema === "boolean") return [];
  return [
    ...Object.entries(schema.properties ?? {}).flatMap(([key, value]) => [
      key,
      ...schemaFields(value),
    ]),
    ...(schema.anyOf ?? schema.oneOf ?? []).flatMap(schemaFields),
    ...schemaFields(schema.items),
  ];
}
