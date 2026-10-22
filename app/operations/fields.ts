import { z } from "zod";

export const emptyInput = z.object({}).strict();
export const id = () => z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const ids = () =>
  z
    .array(id())
    .min(1)
    .max(1000)
    .transform((values) => [...new Set(values)]);
export const text = (label: string, max = 100_000) =>
  z.string().trim().min(1, `${label} is required`).max(max);
export const nullableText = (max = 100_000) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable();
export const url = () => z.string().trim().url().max(4096);
export const confirm = z.literal(true);
export const pagination = {
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
};
export const identifier = z.string().regex(/^[a-f0-9]{32}$/);
export const dateTime = z.iso.datetime({ offset: true });

export function updateContract<S extends z.ZodRawShape>(shape: S) {
  return z
    .object({ id: id(), ...shape })
    .strict()
    .superRefine((value, context) => {
      if (!Object.entries(value).some(([key, item]) => key !== "id" && item !== undefined))
        context.addIssue({ code: "custom", message: "No fields to update" });
    });
}

export const imageInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("keep") }).strict(),
  z.object({ kind: z.literal("clear") }).strict(),
  z.object({ kind: z.literal("url"), url: url() }).strict(),
  z.object({ kind: z.literal("upload"), uploadId: identifier }).strict(),
  z.object({ kind: z.literal("dataUrl"), dataUrl: z.string().max(7_000_000) }).strict(),
  z.object({ kind: z.literal("generateFromIcon") }).strict(),
]);

export function formatValidationError(
  error: z.ZodError,
  schema?: z.ZodType,
  input?: unknown,
): string {
  const json = schema ? z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) : undefined;
  return error.issues
    .map((issue) => {
      const location = issue.path.join(".") || "input";
      if (issue.code !== "unrecognized_keys") return `${location}: ${issue.message}`;
      type Node = {
        properties?: Record<string, Node | boolean>;
        items?: Node | boolean;
        oneOf?: Node[];
        anyOf?: Node[];
        const?: unknown;
      };
      function variant(node: Node | boolean | undefined, value: unknown): Node | undefined {
        if (!node || typeof node !== "object") return undefined;
        const options = node.oneOf ?? node.anyOf;
        if (!options) return node;
        const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
        return (
          options.find((option) =>
            Object.entries(option.properties ?? {}).some(
              ([key, field]) =>
                typeof field === "object" && "const" in field && record[key] === field.const,
            ),
          ) ?? options.find((option) => option.properties)
        );
      }
      let selected = variant(json as Node | undefined, input);
      let value = input;
      for (const part of issue.path) {
        const child =
          typeof part === "number" ? selected?.items : selected?.properties?.[String(part)];
        value =
          value && typeof value === "object"
            ? (value as Record<PropertyKey, unknown>)[part]
            : undefined;
        selected = variant(child, value);
      }
      const allowed =
        selected && typeof selected === "object" && selected.properties
          ? Object.keys(selected.properties).join(", ")
          : "see the operation schema";
      return `Unknown key ${issue.keys.map((key) => `\`${key}\``).join(", ")}. Allowed: ${allowed}`;
    })
    .join("; ");
}
