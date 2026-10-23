import { z } from "zod";
import { rawDb } from "~/db";
import { fetchPublicImage } from "./public-image-fetch.server";
import {
  deleteImage,
  processAndSaveCoverImage,
  processAndSaveIconImage,
  processAndSaveIconImageWithPadding,
} from "./images.server";
import { consumeImageUpload } from "./mcp-image-uploads.server";
import { ImageInputError } from "./image-input.server";
import { isImageReferenced } from "./image-orphans.server";

import {
  imageTargetInput as imageTargetSchema,
  imageSetInput as setEntityImageSchema,
  imageAttachInput as attachImageSchema,
} from "~/operations/contracts/images";
export { imageTargetSchema, setEntityImageSchema, attachImageSchema };
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
  if (
    (input.type === "person" || input.type === "company") &&
    rawDb
      .prepare("SELECT 1 FROM rejected_records WHERE type = ? AND entity_id = ?")
      .get(input.type, input.id)
  )
    throw new ImageInputError("Entity not found.", 404);
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
  const filename = await processTargetImage(input.type, input.role, bytes);
  return attachFilename(input, filename);
}

async function attachFilename(input: ImageTarget, filename: string) {
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

export async function deleteUnreferencedImages(filenames: Array<string | null | undefined>) {
  for (const filename of new Set(filenames)) {
    if (
      filename &&
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(filename) &&
      !isImageReferenced(rawDb, filename)
    )
      await deleteImage(filename);
  }
}

export async function clearEntityImage(input: ImageTarget) {
  const target = targetRow(input);
  const clearSource =
    input.type === "event" && input.role === "cover" ? ", cover_image_url = NULL" : "";
  rawDb
    .prepare(
      `UPDATE \`${target.table}\` SET \`${target.column}\` = NULL${clearSource}, updated_at = ? WHERE id = ?`,
    )
    .run(Math.floor(Date.now() / 1000), input.id);
  await deleteUnreferencedImages([target.filename]);
  return { cleared: true };
}

export async function resolveImageBytes(
  input: Extract<
    import("zod").infer<typeof import("~/operations/fields").imageInput>,
    { kind: "url" | "dataUrl" }
  >,
): Promise<Buffer> {
  if (input.kind === "url") return fetchPublicImage(input.url);
  const { imageContentType, validateImage } = await import("./image-input.server");
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=\s]+)$/.exec(input.dataUrl);
  if (!match) throw new ImageInputError("Invalid image data URL");
  const bytes = Buffer.from(match[2], "base64");
  await validateImage(bytes, imageContentType(match[1]));
  return bytes;
}

export async function withImageBytes<T>(
  input: Extract<
    import("zod").infer<typeof import("~/operations/fields").imageInput>,
    { kind: "url" | "upload" | "dataUrl" }
  >,
  run: (bytes: Buffer) => Promise<T>,
): Promise<T> {
  if (input.kind === "upload") return consumeImageUpload(input.uploadId, run);
  return run(await resolveImageBytes(input));
}

export async function applyEntityImage(
  input: ImageTarget,
  image: import("zod").infer<typeof import("~/operations/fields").imageInput> | undefined,
) {
  if (!image || image.kind === "keep") return;
  if (image.kind === "clear") return clearEntityImage(input);
  if (image.kind === "generateFromIcon") {
    if (input.role !== "cover")
      throw new ImageInputError("Only a cover can be generated from an icon");
    const { readFile } = await import("node:fs/promises");
    const { generateCoverFromIcon, getImagePath } = await import("./images.server");
    const icon = targetRow({ ...input, role: "icon" });
    if (!icon.filename) throw new ImageInputError("Upload an icon before generating a cover");
    const filename = await generateCoverFromIcon(await readFile(getImagePath(icon.filename)));
    return attachFilename(input, filename);
  }
  return withImageBytes(image, (bytes) => attachBytes(input, bytes));
}

type ImageCommand = import("zod").infer<typeof import("~/operations/fields").imageInput>;
type ImageFields = Partial<
  Record<"avatar" | "logo" | "icon" | "iconImage" | "coverImage" | "coverImageUrl", string | null>
>;

export async function withEntityImages<T>(
  target: { type: ImageTarget["type"]; id?: number },
  commands: { icon?: ImageCommand; cover?: ImageCommand },
  save: (fields: ImageFields) => Promise<T>,
): Promise<T> {
  const created: string[] = [];
  const previous: Array<string | null> = [];
  const fields: ImageFields = {};
  const iconField =
    target.type === "event"
      ? "iconImage"
      : target.type === "person"
        ? "avatar"
        : target.type === "technology"
          ? "icon"
          : "logo";
  const roles = ["icon", "cover"] as const;
  async function next(index: number): Promise<T> {
    if (index === roles.length) return save(fields);
    const role = roles[index];
    const command = commands[role];
    if (!command || command.kind === "keep") return next(index + 1);
    if (!targets[target.type][role])
      throw new ImageInputError(`${target.type} does not support ${role} images`);
    const key = role === "cover" ? "coverImage" : iconField;
    if (target.type === "event" && role === "cover") fields.coverImageUrl = null;
    if (target.id !== undefined)
      previous.push(targetRow({ ...target, id: target.id, role }).filename);
    if (command.kind === "clear") {
      fields[key] = null;
      return next(index + 1);
    }
    if (command.kind === "generateFromIcon") {
      if (role !== "cover") throw new ImageInputError("Only covers can be generated from icons");
      const icon = Object.hasOwn(fields, iconField)
        ? fields[iconField]
        : target.id !== undefined
          ? targetRow({ ...target, id: target.id, role: "icon" }).filename
          : null;
      if (!icon || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(icon))
        throw new ImageInputError("Upload an icon before generating a cover");
      const { readFile } = await import("node:fs/promises");
      const { generateCoverFromIcon, getImagePath } = await import("./images.server");
      fields[key] = await generateCoverFromIcon(await readFile(getImagePath(icon)));
      created.push(fields[key]!);
      return next(index + 1);
    }
    return withImageBytes(command, async (bytes) => {
      fields[key] = await processTargetImage(target.type, role, bytes);
      created.push(fields[key]!);
      return next(index + 1);
    });
  }
  try {
    const result = await next(0);
    await deleteUnreferencedImages(previous);
    return result;
  } catch (error) {
    await deleteUnreferencedImages(created);
    throw error;
  }
}

function processTargetImage(type: ImageTarget["type"], role: ImageTarget["role"], bytes: Buffer) {
  return (
    role === "cover"
      ? processAndSaveCoverImage
      : type === "product"
        ? processAndSaveIconImageWithPadding
        : processAndSaveIconImage
  )(bytes);
}
