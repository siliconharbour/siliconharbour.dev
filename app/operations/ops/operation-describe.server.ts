import { z } from "zod";
import { defineOperation } from "../define";
import { text } from "../fields";
import { ForbiddenError, NotFoundError } from "../errors";
const descriptionOutput = z
  .object({
    name: z.string(),
    area: z.string(),
    summary: z.string(),
    description: z.string(),
    risk: z.string(),
    access: z.string(),
    inputSchema: z.record(z.string(), z.unknown()),
    outputSchema: z.record(z.string(), z.unknown()),
    examples: z.array(z.object({ title: z.string(), input: z.unknown() }).strict()),
  })
  .strict();
export const operationDescribe = defineOperation({
  name: "operationDescribe",
  area: "operations",
  risk: "read",
  access: "public",
  summary: "Describe an available operation and its contracts.",
  description:
    "Return input/output JSON Schemas, access, risk and examples for an operation available to this actor and scopes. No records are read. Use this inside a program after discovering a name.",
  input: z.object({ name: text("name", 120) }).strict(),
  output: descriptionOutput,
  examples: [{ title: "Describe public events", input: { name: "eventPublicList" } }],
  run: async (context, { name }): Promise<z.output<typeof descriptionOutput>> => {
    const { operationCatalog } = await import("../catalog");
    if (!Object.hasOwn(operationCatalog, name)) throw new NotFoundError("Operation not found");
    const operation = operationCatalog[name as keyof typeof operationCatalog];
    if (
      (operation.access === "admin" && context.actor?.role !== "admin") ||
      !context.scopes.has(operation.risk === "read" ? "read" : "write")
    )
      throw new ForbiddenError("Operation is not available to this actor and scopes");
    return {
      name,
      area: operation.area,
      summary: operation.summary,
      description: operation.description,
      risk: operation.risk,
      access: operation.access,
      inputSchema: z.toJSONSchema(operation.input, { io: "input", unrepresentable: "any" }),
      outputSchema: z.toJSONSchema(operation.output, { io: "output", unrepresentable: "any" }),
      examples: operation.examples,
    };
  },
});
