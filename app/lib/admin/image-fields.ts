import { readFile } from "fs/promises";
import { deleteImage, generateCoverFromIcon, getImagePath } from "~/lib/images.server";

function decodeDataUrlImage(dataUrl: string): Buffer {
  const base64Data = dataUrl.split(",")[1];
  return Buffer.from(base64Data, "base64");
}

/**
 * Resolve the icon image as a raw buffer — used by the
 * "generate cover from icon" path. Prefers the freshly-uploaded data URL
 * sitting in the form, falls back to the saved file on disk for an
 * existing event.
 */
async function resolveIconBuffer(
  formData: FormData,
  currentIconImage: string | null,
): Promise<Buffer | null> {
  const uploaded = formData.get("iconImageData");
  if (typeof uploaded === "string" && uploaded) {
    return decodeDataUrlImage(uploaded);
  }
  const existing = formData.get("existingIconImage");
  const filename =
    typeof existing === "string" && existing ? existing : currentIconImage;
  if (!filename) return null;
  try {
    return await readFile(getImagePath(filename));
  } catch {
    return null;
  }
}

/**
 * If the form requested cover-from-icon generation, synthesize it and
 * return the new cover filename (and deletes the old cover, if any).
 * Returns null when the flag is off or when no icon is available.
 */
export async function resolveGeneratedCoverImage(
  formData: FormData,
  currentCoverImage: string | null,
  currentIconImage: string | null,
): Promise<string | null> {
  if (formData.get("generateCoverFromIcon") !== "true") {
    return null;
  }
  const iconBuffer = await resolveIconBuffer(formData, currentIconImage);
  if (!iconBuffer) return null;

  if (currentCoverImage) {
    await deleteImage(currentCoverImage);
  }
  return generateCoverFromIcon(iconBuffer);
}

export async function createImageFromFormData(
  formData: FormData,
  imageFieldName: string,
  processor: (buffer: Buffer) => Promise<string>,
): Promise<string | null> {
  const imageData = formData.get(imageFieldName);
  if (typeof imageData !== "string" || !imageData) {
    return null;
  }

  return processor(decodeDataUrlImage(imageData));
}

interface ResolveImageOptions {
  formData: FormData;
  uploadedImageField: string;
  existingImageField: string;
  currentImage: string | null;
  processor: (buffer: Buffer) => Promise<string>;
}

export async function resolveUpdatedImage({
  formData,
  uploadedImageField,
  existingImageField,
  currentImage,
  processor,
}: ResolveImageOptions): Promise<string | null | undefined> {
  const uploadedData = formData.get(uploadedImageField);
  const existingFromForm = formData.get(existingImageField);

  if (typeof uploadedData === "string" && uploadedData) {
    if (currentImage) {
      await deleteImage(currentImage);
    }
    return processor(decodeDataUrlImage(uploadedData));
  }

  if (typeof existingFromForm === "string" && existingFromForm) {
    return existingFromForm;
  }

  if (currentImage) {
    await deleteImage(currentImage);
    return null;
  }

  return undefined;
}
