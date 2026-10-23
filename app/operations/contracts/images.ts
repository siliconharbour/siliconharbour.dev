import { listInput } from "../listing";
import { z } from "zod";
import { id, url, identifier, confirm, imageContentTypes, MAX_IMAGE_BYTES } from "../fields";
export const imageTargetInput = z
  .object({
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
    id: id(),
    role: z.enum(["cover", "icon"]),
  })
  .strict();
export const imageSetInput = imageTargetInput.extend({ url: url(), confirm }).strict();
export const imageAttachInput = imageTargetInput.extend({ uploadId: identifier, confirm }).strict();
export const imageClearInput = imageTargetInput.extend({ confirm }).strict();
export const imageUploadInput = z
  .object({
    filename: z.string().min(1).max(200).optional(),
    contentType: z.enum(imageContentTypes),
    size: z.number().int().min(1).max(MAX_IMAGE_BYTES),
  })
  .strict();
export const imageAttachedOutput = z
  .object({
    type: imageTargetInput.shape.type,
    id: id(),
    role: imageTargetInput.shape.role,
    filename: z.string(),
    url: z.string(),
  })
  .strict();
export const imageUploadOutput = z
  .object({
    uploadId: identifier,
    uploadUrl: z.string(),
    method: z.string(),
    headers: z.object({ Authorization: z.string(), "Content-Type": z.string() }).strict(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const orphanListInput = listInput(["stagedAt", "filename", "sizeBytes"]);
export const orphanStageInput = z
  .object({
    batchSize: z.number().int().min(1).max(5000).default(250),
    resetCursor: z.boolean().default(false),
    dryRun: z.boolean().default(false),
  })
  .strict();
export const orphanDeleteInput = z.object({ path: z.string().min(1).max(4096), confirm }).strict();
const cursorOutput = z
  .object({ nextOffset: z.number(), totalImagesLastRun: z.number(), updatedAt: z.iso.datetime() })
  .strict();
export const orphanListOutput = z
  .object({
    items: z.array(
      z
        .object({
          path: z.string(),
          filename: z.string(),
          sizeBytes: z.number(),
          stagedAt: z.iso.datetime(),
          reason: z.string(),
        })
        .strict(),
    ),
    stagedTotal: z.number(),
    stagedBytes: z.number(),
    cursor: cursorOutput.nullable(),
    reportCount: z.number(),
    total: z.number().int().nonnegative(),
    nextOffset: z.number().int().nonnegative().nullable(),
  })
  .strict();
export const orphanDeleteOutput = z
  .object({
    requestedCount: z.number(),
    deletedCount: z.number(),
    missingCount: z.number(),
    referencedCount: z.number(),
    failedCount: z.number(),
    remainingStagedCount: z.number(),
  })
  .strict();
export const orphanStageOutput = z
  .object({
    scannedCount: z.number(),
    referencedCount: z.number(),
    orphanCount: z.number(),
    newlyStagedCount: z.number(),
    stagedTotal: z.number(),
    startOffset: z.number(),
    endOffset: z.number(),
    totalImages: z.number(),
    nextOffset: z.number(),
    dryRun: z.boolean(),
    reportPath: z.string().nullable(),
    stagedPath: z.string(),
    cursorPath: z.string(),
  })
  .strict();
