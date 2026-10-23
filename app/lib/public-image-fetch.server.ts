import { fetchPublicBytes, isPublicAddress, PublicFetchError } from "./public-fetch.server";
import {
  ImageInputError,
  MAX_IMAGE_BYTES,
  imageContentType,
  validateImage,
} from "./image-input.server";

export { isPublicAddress as isPublicImageAddress };

export async function fetchPublicImage(value: string): Promise<Buffer> {
  try {
    const { bytes, contentType } = await fetchPublicBytes(value, {
      accept: "image/jpeg,image/png,image/webp,image/gif,image/avif",
      maxBytes: MAX_IMAGE_BYTES,
    });
    await validateImage(bytes, imageContentType(contentType));
    return bytes;
  } catch (error) {
    if (error instanceof PublicFetchError) throw new ImageInputError(error.message, error.status);
    throw error;
  }
}
