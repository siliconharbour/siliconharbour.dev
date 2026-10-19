import sharp from "sharp";
import { z } from "zod";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const imageContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
export type ImageContentType = z.infer<typeof imageContentTypeSchema>;
export class ImageInputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function imageContentType(value: string | null): ImageContentType {
  const parsed = imageContentTypeSchema.safeParse(value?.split(";")[0].trim().toLowerCase());
  if (!parsed.success) throw new ImageInputError("Use JPEG, PNG, WebP, GIF or AVIF.", 415);
  return parsed.data;
}
export async function validateImage(bytes: Buffer, contentType: ImageContentType) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new ImageInputError("Image must be between 1 byte and 5 MiB.", 413);
  const type = bytes.subarray(0, 12);
  const matches = {
    "image/jpeg": type[0] === 255 && type[1] === 216 && type[2] === 255,
    "image/png": type.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/webp":
      type.toString("ascii", 0, 4) === "RIFF" && type.toString("ascii", 8, 12) === "WEBP",
    "image/gif": ["GIF87a", "GIF89a"].includes(type.toString("ascii", 0, 6)),
    "image/avif":
      type.toString("ascii", 4, 8) === "ftyp" && type.toString("ascii", 8, 12) === "avif",
  };
  if (!matches[contentType])
    throw new ImageInputError("Image bytes do not match the content type.", 415);
  try {
    const metadata = await sharp(bytes, {
      limitInputPixels: 16_000_000,
      failOn: "warning",
    }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > 16_000_000 ||
      (metadata.pages ?? 1) > 1
    )
      throw new ImageInputError("Use a static image no larger than 16 megapixels.");
  } catch (error) {
    if (error instanceof ImageInputError) throw error;
    throw new ImageInputError("Image could not be decoded or exceeds 16 megapixels.");
  }
}
