import { z } from "zod";
import { rawDb } from "~/db";
import { fetchPublicImage } from "./public-image-fetch.server";
import { deleteImage, processAndSaveCoverImage, processAndSaveIconImage } from "./images.server";
import { consumeImageUpload } from "./mcp-image-uploads.server";
import { ImageInputError } from "./image-input.server";
import { isImageReferenced } from "./image-orphans.server";

export const imageTargetSchema = z.object({
  type: z.enum([
    "event",
    "company",
    "group",
    "person",
    "education",
    "project",
    "product",
    "news",
    "technology",
  ]),
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  role: z.enum(["cover", "icon"]),
});
export const setEntityImageSchema = imageTargetSchema
  .extend({ url: z.string().url().max(4096) })
  .strict();
export const attachImageSchema = imageTargetSchema
  .extend({ uploadId: z.string().regex(/^[a-f0-9]{32}$/) })
  .strict();
type ImageTarget = z.infer<typeof imageTargetSchema>;
const targets = {
  event: { table: "events", cover: "cover_image", icon: "icon_image" },
  company: { table: "companies", cover: "cover_image", icon: "logo" },
  group: { table: "groups", cover: "cover_image", icon: "logo" },
  education: { table: "education", cover: "cover_image", icon: "logo" },
  person: { table: "people", cover: null, icon: "avatar" },
  project: { table: "projects", cover: "cover_image", icon: "logo" },
  product: { table: "products", cover: "cover_image", icon: "logo" },
  news: { table: "news", cover: "cover_image", icon: null },
  technology: { table: "technologies", cover: null, icon: "icon" },
} as const;
function targetRow(input: ImageTarget) {
  const target = targets[input.type];
  const column = target[input.role];
  if (!column) throw new ImageInputError(`${input.type} does not support ${input.role} images.`);
  const row = rawDb
    .prepare(`SELECT \`${column}\` AS filename FROM \`${target.table}\` WHERE id = ?`)
    .get(input.id) as { filename: string | null } | undefined;
  if (!row) throw new ImageInputError("Entity not found.", 404);
  return { table: target.table, column, filename: row.filename };
}
async function attachBytes(input: ImageTarget, bytes: Buffer) {
  const filename = await (
    input.role === "cover" ? processAndSaveCoverImage : processAndSaveIconImage
  )(bytes);
  let previous: string | null;
  try {
    previous = rawDb
      .transaction(() => {
        const target = targetRow(input);
        const clearSource =
          input.type === "event" && input.role === "cover" ? ", `cover_image_url` = NULL" : "";
        rawDb
          .prepare(
            `UPDATE \`${target.table}\` SET \`${target.column}\` = ?, updated_at = ?${clearSource} WHERE id = ?`,
          )
          .run(filename, Math.floor(Date.now() / 1000), input.id);
        return target.filename;
      })
      .immediate();
  } catch (error) {
    await deleteImage(filename);
    throw error;
  }
  if (previous && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(previous)) {
    try {
      if (!isImageReferenced(rawDb, previous)) await deleteImage(previous);
    } catch (error) {
      console.error("Replaced image cleanup failed", error);
    }
  }
  return { type: input.type, id: input.id, role: input.role, filename, url: `/images/${filename}` };
}
export async function setEntityImage(input: unknown) {
  const data = setEntityImageSchema.parse(input);
  targetRow(data);
  const bytes = await fetchPublicImage(data.url);
  return attachBytes(data, bytes);
}
export async function attachImage(input: unknown) {
  const data = attachImageSchema.parse(input);
  targetRow(data);
  return consumeImageUpload(data.uploadId, (bytes) => attachBytes(data, bytes));
}
