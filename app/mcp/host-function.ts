import { schemaType, type JsonSchema } from "./schema-docs";
import { z } from "zod";
import type { OperationArea, OperationRisk } from "~/operations/define";
export interface HostFnDoc {
  signature: string;
  description: string;
  category: OperationArea;
  risk: OperationRisk;
}
export type HostFunction = ((input: unknown) => Promise<unknown>) & {
  doc: HostFnDoc;
  inputSchema: z.ZodType;
  outputSchema?: z.ZodType;
};
export type HostFunctions = Record<string, HostFunction>;
export interface HostFunctionDocsEntry extends HostFnDoc {
  name: string;
}
export interface HostFunctionDocs {
  read: HostFunctionDocsEntry[];
  execute: HostFunctionDocsEntry[];
}

export type HostFnCategory = OperationArea;

export function hostSignature(name: string, input: z.ZodType) {
  return `${name}(input: ${schemaType(z.toJSONSchema(input, { io: "input", unrepresentable: "any" }) as JsonSchema)})`;
}
