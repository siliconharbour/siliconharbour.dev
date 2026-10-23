import { canonicalUrl, githubProfile } from "~/lib/url-fields";
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
export const createOptions = {
  ifNotExists: z
    .boolean()
    .optional()
    .describe(
      "Return an existing record for this operation's stable identity without changing it. Requires the identity fields documented by the operation.",
    ),
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
  z.object({ kind: z.literal("clear"), confirm }).strict(),
  z.object({ kind: z.literal("url"), confirm, url: url() }).strict(),
  z.object({ kind: z.literal("upload"), confirm, uploadId: identifier }).strict(),
  z.object({ kind: z.literal("dataUrl"), confirm, dataUrl: z.string().max(7_000_000) }).strict(),
  z.object({ kind: z.literal("generateFromIcon"), confirm }).strict(),
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
export { canonicalUrl, githubProfile, email } from "~/lib/url-fields";
export const nullableUrl = () => nullableText(4096).pipe(canonicalUrl().nullable());
export const nullableGithubProfile = () => nullableText(4096).pipe(githubProfile().nullable());
export { socialLinksPatch as socialLinks, projectLinksPatch as projectLinks } from "~/lib/links";
export const idInput = z.object({ id: id() }).strict();
export const deleteInput = z.object({ id: id(), confirm }).strict();

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

export { imageContentTypes, MAX_IMAGE_BYTES } from "~/lib/image-types";
