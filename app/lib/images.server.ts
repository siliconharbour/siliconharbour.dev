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

export async function processAndSaveCoverImage(buffer: Buffer, crop?: CropArea): Promise<string> {
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
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toFile(filepath);

  return filename;
}

export async function processAndSaveIconImage(buffer: Buffer, crop?: CropArea): Promise<string> {
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
export async function processAndSaveIconImageWithPadding(buffer: Buffer): Promise<string> {
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

// ── Cover generation from icon palette ─────────────────────────────────

interface RGB {
  r: number;
  g: number;
  b: number;
}

function rgb(r: number, g: number, b: number): RGB {
  return { r, g, b };
}

function rgbCss(c: RGB): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

/** Perceived luminance per Rec. 709. */
function luminance(c: RGB): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Squared distance between two colors in RGB space. */
function distanceSq(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** Shift HSL lightness without changing hue too much — used as a fallback
 * when the icon only yields one usable color. */
function shiftLightness(c: RGB, delta: number): RGB {
  const adjust = (v: number) => Math.max(0, Math.min(255, Math.round(v + delta)));
  return rgb(adjust(c.r), adjust(c.g), adjust(c.b));
}

/** Saturation = (max - min) / max in [0, 1], 0 for pure grays/whites/blacks. */
function saturation(c: RGB): number {
  const max = Math.max(c.r, c.g, c.b);
  if (max === 0) return 0;
  const min = Math.min(c.r, c.g, c.b);
  return (max - min) / max;
}

/**
 * Extract two dominant colors from an icon. Quantizes to 16 levels per
 * channel (4096 buckets) and weights each bucket by frequency × a
 * preference for vivid, mid-tone colors so logo backgrounds (near-white)
 * and outlines (near-black) don't drown out the actual brand colors.
 * The two picks are guaranteed to be at least MIN_DISTANCE_SQ apart in
 * RGB space; if no second pick qualifies, we derive one by shifting
 * lightness so the gradient still has a visible transition.
 */
async function extractIconPalette(iconBuffer: Buffer): Promise<[RGB, RGB]> {
  // Sample at 64x64 (4096 pixels). Higher than the original 16x16 so
  // small but vivid accents (e.g. a logo's red eye on an otherwise b&w
  // mark) still get a representative count after bucketing.
  const { data } = await sharp(iconBuffer)
    .resize(64, 64, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map<number, { count: number; rSum: number; gSum: number; bSum: number }>();
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const key = ((r & 0xf0) << 16) | ((g & 0xf0) << 8) | (b & 0xf0);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.rSum += r;
      bucket.gSum += g;
      bucket.bSum += b;
    } else {
      buckets.set(key, { count: 1, rSum: r, gSum: g, bSum: b });
    }
  }

  // Score each bucket by frequency × vividness preference. We strongly
  // demote near-white backgrounds (they're almost always padding) but
  // keep pure-black candidates because mono logos legitimately use them.
  // Saturated colors get a boost so brand accents bubble up.
  const candidates = [...buckets.values()]
    .map((bucket) => {
      const color = rgb(
        Math.round(bucket.rSum / bucket.count),
        Math.round(bucket.gSum / bucket.count),
        Math.round(bucket.bSum / bucket.count),
      );
      const lum = luminance(color);
      const sat = saturation(color);
      // Hard-drop near-white (likely padding), keep everything else.
      const lumPenalty = lum > 230 ? 0.001 : 1;
      // Strongly boost saturated colors so brand accents win over outlines.
      const satBoost = 1 + sat * 6;
      return {
        color,
        score: bucket.count * lumPenalty * satBoost,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return [rgb(100, 116, 139), rgb(30, 41, 59)]; // harbour-ish grays
  }

  const primary = candidates[0].color;

  // Pick the next bucket that's at least MIN_DISTANCE_SQ away from primary
  // (in RGB). If none qualifies, derive a second by shifting lightness so
  // the gradient still has a visible transition.
  const MIN_DISTANCE_SQ = 60 * 60;
  let secondary: RGB | null = null;
  for (const c of candidates.slice(1)) {
    if (distanceSq(c.color, primary) >= MIN_DISTANCE_SQ) {
      secondary = c.color;
      break;
    }
  }
  if (!secondary) {
    const delta = luminance(primary) > 128 ? -70 : 70;
    secondary = shiftLightness(primary, delta);
  }

  return [primary, secondary];
}

/**
 * Generate a 1200x400 cover image from an icon's color palette.
 *
 * Approach: extract two dominant colors, compose a diagonal linear
 * gradient between them as SVG, and overlay subtle film grain via
 * SVG feTurbulence. Rendered through sharp so the output matches the
 * rest of the image pipeline (webp, identical sizing, uuid filename).
 */
export async function generateCoverFromIcon(iconBuffer: Buffer): Promise<string> {
  const [a, b] = await extractIconPalette(iconBuffer);

  // Order the gradient so the brighter color is on top-left (matches the
  // event detail layout where the icon will overlay the bottom of the
  // banner).
  const [topLeft, bottomRight] = luminance(a) >= luminance(b) ? [a, b] : [b, a];

  const svg = `<svg width="1200" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${rgbCss(topLeft)}"/>
      <stop offset="100%" stop-color="${rgbCss(bottomRight)}"/>
    </linearGradient>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect width="100%" height="100%" filter="url(#noise)"/>
</svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return processAndSaveCoverImage(pngBuffer);
}
