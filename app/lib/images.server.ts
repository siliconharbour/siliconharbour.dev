import sharp from "sharp";
import { existsSync, mkdirSync } from "fs";
import { unlink } from "fs/promises";
import { join } from "path";
import { v4 as uuid } from "uuid";
import { IMAGES_DIR } from "./paths.server";
const COVER_MAX_WIDTH = 1200;
const COVER_MAX_HEIGHT = 630;
const ICON_SIZE = 256;

// Ensure images directory exists
if (!existsSync(IMAGES_DIR)) {
  mkdirSync(IMAGES_DIR, { recursive: true });
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function processAndSaveCoverImage(
  buffer: Buffer,
  crop?: CropArea
): Promise<string> {
  const filename = `cover-${uuid()}.webp`;
  const filepath = join(IMAGES_DIR, filename);

  let image = sharp(buffer);

  if (crop) {
    image = image.extract({
      left: Math.round(crop.x),
      top: Math.round(crop.y),
      width: Math.round(crop.width),
      height: Math.round(crop.height),
    });
  }

  await image
    .resize(COVER_MAX_WIDTH, COVER_MAX_HEIGHT, {
      fit: "cover",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toFile(filepath);

  return filename;
}

export async function processAndSaveIconImage(
  buffer: Buffer,
  crop?: CropArea
): Promise<string> {
  const filename = `icon-${uuid()}.webp`;
  const filepath = join(IMAGES_DIR, filename);

  let image = sharp(buffer);

  if (crop) {
    image = image.extract({
      left: Math.round(crop.x),
      top: Math.round(crop.y),
      width: Math.round(crop.width),
      height: Math.round(crop.height),
    });
  }

  await image
    .resize(ICON_SIZE, ICON_SIZE, {
      fit: "cover",
    })
    .webp({ quality: 85 })
    .toFile(filepath);

  return filename;
}

/**
 * Process an image to 1:1 aspect ratio by adding padding (no cropping).
 * The image is centered and padded with white background to make it square,
 * then resized to the target icon size.
 */
export async function processAndSaveIconImageWithPadding(
  buffer: Buffer
): Promise<string> {
  const filename = `icon-${uuid()}.webp`;
  const filepath = join(IMAGES_DIR, filename);

  // Flatten onto white background first (removes transparency),
  // then resize with contain fit to add white padding as needed
  await sharp(buffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(ICON_SIZE, ICON_SIZE, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .webp({ quality: 85 })
    .toFile(filepath);

  return filename;
}

export async function deleteImage(filename: string): Promise<void> {
  const filepath = join(IMAGES_DIR, filename);
  if (existsSync(filepath)) {
    await unlink(filepath);
  }
}

export function getImagePath(filename: string): string {
  return join(IMAGES_DIR, filename);
}
