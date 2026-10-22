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
      const discriminator =
        typeof input === "object" && input && "type" in input ? input.type : undefined;
      const variants = json && (json.oneOf ?? json.anyOf);
      const selected = Array.isArray(variants)
        ? variants.find(
            (variant) =>
              typeof variant === "object" &&
              typeof variant.properties?.type === "object" &&
              "const" in variant.properties.type &&
              variant.properties.type.const === discriminator,
          )
        : json;
      const allowed =
        selected && typeof selected === "object" && selected.properties
          ? Object.keys(selected.properties).join(", ")
          : "see the operation schema";
      return `Unknown key ${issue.keys.map((key) => `\`${key}\``).join(", ")}. Allowed: ${allowed}`;
    })
    .join("; ");
}
