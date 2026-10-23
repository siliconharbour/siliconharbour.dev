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

export * from "~/lib/entity-types";
export const nullableUrl = () =>
  nullableText(4096)
    .transform((value) =>
      value && !/^[a-z][a-z0-9+.-]*:/i.test(value) ? `https://${value}` : value,
    )
    .pipe(z.url({ protocol: /^https?$/ }).nullable());
export const socialLinks = z
  .object({ twitter: url().optional(), linkedin: url().optional() })
  .strict()
  .nullable();
export const projectLinks = z
  .object({
    github: url().optional(),
    itchio: url().optional(),
    website: url().optional(),
    demo: url().optional(),
    npm: url().optional(),
    pypi: url().optional(),
    steam: url().optional(),
    appstore: url().optional(),
    playstore: url().optional(),
  })
  .strict()
  .nullable();
export const idInput = z.object({ id: id() }).strict();
export const deleteInput = z.object({ id: id(), confirm }).strict();
export const adminListInput = z
  .object({
    ...pagination,
    query: z.string().trim().max(500).optional(),
    visible: z.boolean().optional(),
  })
  .strict();

export const imageFileInput = z.discriminatedUnion("kind", [
  imageInput.options[2],
  imageInput.options[3],
  imageInput.options[4],
]);

export const lookupInput = z
  .object({
    id: id().optional(),
    slug: text("slug", 500).optional(),
    name: text("name", 300).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (Object.values(input).filter((value) => value !== undefined).length !== 1)
      context.addIssue({ code: "custom", message: "Supply exactly one of id, slug, or name" });
  });

export { technologyProvenanceSourceKeys } from "~/lib/technology-evidence";
