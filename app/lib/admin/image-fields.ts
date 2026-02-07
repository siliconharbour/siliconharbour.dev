import { deleteImage } from "~/lib/images.server";

function decodeDataUrlImage(dataUrl: string): Buffer {
  const base64Data = dataUrl.split(",")[1];
  return Buffer.from(base64Data, "base64");
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
