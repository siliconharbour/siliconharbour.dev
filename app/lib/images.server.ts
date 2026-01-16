import sharp from "sharp";
import { existsSync, mkdirSync } from "fs";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { v4 as uuid } from "uuid";

const IMAGES_DIR = "./data/images";
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

export async function deleteImage(filename: string): Promise<void> {
  const filepath = join(IMAGES_DIR, filename);
  if (existsSync(filepath)) {
    await unlink(filepath);
  }
}

export function getImagePath(filename: string): string {
  return join(IMAGES_DIR, filename);
}
