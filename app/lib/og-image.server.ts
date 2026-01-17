import satori, { type SatoriOptions } from "satori";
import sharp from "sharp";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// OG Image dimensions (standard)
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Cache directory
const CACHE_DIR = join(tmpdir(), "siliconharbour-og");

// Ensure cache directory exists
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

// Load fonts once at module init
const interRegular = readFileSync(
  join(process.cwd(), "app/assets/fonts/Inter-Regular.ttf")
);
const interBold = readFileSync(
  join(process.cwd(), "app/assets/fonts/Inter-Bold.ttf")
);

// Harbour color palette
const colors = {
  harbour50: "#e8f0ff",
  harbour100: "#d1e0ff",
  harbour200: "#89adff",
  harbour300: "#7593fa",
  harbour400: "#587bf0",
  harbour500: "#4166e2",
  harbour600: "#2b51d1",
  harbour700: "#2144bb",
  harbour800: "#1a369a",
  harbour900: "#142a7a",
  white: "#ffffff",
};

interface OGImageData {
  title: string;
  date?: string;
  subtitle?: string;
  coverImagePath?: string;
  type: "event" | "news";
}

/**
 * Generate a cache key hash from the input data
 */
function generateCacheKey(data: OGImageData): string {
  const hash = createHash("md5")
    .update(JSON.stringify(data))
    .digest("hex")
    .slice(0, 12);
  return hash;
}

/**
 * Get the cache file path for given data
 */
function getCachePath(slug: string, data: OGImageData): string {
  const hash = generateCacheKey(data);
  return join(CACHE_DIR, `${data.type}-${slug}-${hash}.png`);
}

/**
 * Check if a cached image exists and return its path
 */
export function getCachedImage(slug: string, data: OGImageData): string | null {
  const cachePath = getCachePath(slug, data);
  if (existsSync(cachePath)) {
    return cachePath;
  }
  return null;
}

/**
 * Load a cover image and return as base64 data URL
 */
async function loadCoverImageAsBase64(imagePath: string): Promise<string | null> {
  try {
    const fullPath = join(process.cwd(), "data/images", imagePath);
    if (!existsSync(fullPath)) {
      return null;
    }
    
    // Resize to OG dimensions and convert to PNG for embedding
    const buffer = await sharp(fullPath)
      .resize(OG_WIDTH, OG_HEIGHT, { fit: "cover" })
      .png()
      .toBuffer();
    
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Generate the OG image SVG using Satori
 */
async function generateSVG(data: OGImageData): Promise<string> {
  const coverImageBase64 = data.coverImagePath 
    ? await loadCoverImageAsBase64(data.coverImagePath)
    : null;

  // Build the JSX element for Satori
  // Satori accepts React-like element objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element: any = {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        fontFamily: "Inter",
        backgroundColor: colors.harbour700,
        position: "relative",
      },
      children: [
        // Background image with overlay (if exists)
        coverImageBase64 && {
          type: "img",
          props: {
            src: coverImageBase64,
            style: {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            },
          },
        },
        // Dimming overlay (harbour-200 at 15% like img-tint)
        coverImageBase64 && {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: colors.harbour200,
              opacity: 0.15,
            },
          },
        },
        // Dark overlay for text readability
        coverImageBase64 && {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(0, 0, 0, 0.5)",
            },
          },
        },
        // Header with logo and site name
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "16px",
              position: "relative",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    width: "48px",
                    height: "48px",
                    backgroundColor: colors.white,
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "24px",
                    fontWeight: 700,
                    color: colors.harbour700,
                  },
                  children: "SH",
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    fontSize: "24px",
                    fontWeight: 600,
                    color: colors.white,
                  },
                  children: "siliconharbour.dev",
                },
              },
            ],
          },
        },
        // Main content area
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              position: "relative",
              flex: 1,
              justifyContent: "center",
            },
            children: [
              // Type badge
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                  },
                  children: {
                    type: "div",
                    props: {
                      style: {
                        backgroundColor: colors.harbour400,
                        color: colors.white,
                        padding: "8px 16px",
                        borderRadius: "4px",
                        fontSize: "16px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      },
                      children: data.type === "event" ? "Event" : "News",
                    },
                  },
                },
              },
              // Title
              {
                type: "div",
                props: {
                  style: {
                    fontSize: data.title.length > 60 ? "42px" : "52px",
                    fontWeight: 700,
                    color: colors.white,
                    lineHeight: 1.2,
                    maxWidth: "90%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  },
                  children: data.title,
                },
              },
              // Date and subtitle
              data.date && {
                type: "div",
                props: {
                  style: {
                    fontSize: "24px",
                    color: colors.harbour100,
                    fontWeight: 500,
                  },
                  children: data.date,
                },
              },
              data.subtitle && {
                type: "div",
                props: {
                  style: {
                    fontSize: "20px",
                    color: colors.harbour200,
                  },
                  children: data.subtitle,
                },
              },
            ].filter(Boolean),
          },
        },
      ].filter(Boolean),
    },
  };

  const svg = await satori(element, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [
      {
        name: "Inter",
        data: interRegular,
        weight: 400,
        style: "normal",
      },
      {
        name: "Inter",
        data: interBold,
        weight: 700,
        style: "normal",
      },
    ],
  });

  return svg;
}

/**
 * Generate and cache an OG image, returning the PNG buffer
 */
export async function generateOGImage(
  slug: string,
  data: OGImageData
): Promise<Buffer> {
  // Check cache first
  const cachedPath = getCachedImage(slug, data);
  if (cachedPath) {
    return readFileSync(cachedPath);
  }

  // Generate SVG
  const svg = await generateSVG(data);

  // Convert SVG to PNG using Sharp
  const pngBuffer = await sharp(Buffer.from(svg))
    .png({ quality: 90 })
    .toBuffer();

  // Save to cache
  const cachePath = getCachePath(slug, data);
  await writeFile(cachePath, pngBuffer);

  return pngBuffer;
}

/**
 * Clean up old cache files (call periodically)
 * Removes files older than maxAge (default 7 days)
 */
export function cleanupCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  let cleaned = 0;
  const now = Date.now();

  try {
    const files = readdirSync(CACHE_DIR);
    for (const file of files) {
      const filePath = join(CACHE_DIR, file);
      const stat = statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        unlinkSync(filePath);
        cleaned++;
      }
    }
  } catch {
    // Ignore errors during cleanup
  }

  return cleaned;
}

/**
 * Prepare OG image data for an event
 */
export function prepareEventOGData(event: {
  title: string;
  dates: { startDate: Date }[];
  location?: string | null;
  coverImage?: string | null;
}): OGImageData {
  const nextDate = event.dates[0];
  const dateStr = nextDate
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(nextDate.startDate))
    : undefined;

  return {
    title: event.title,
    date: dateStr,
    subtitle: event.location || undefined,
    coverImagePath: event.coverImage || undefined,
    type: "event",
  };
}

/**
 * Prepare OG image data for a news article
 */
export function prepareNewsOGData(article: {
  title: string;
  publishedAt?: Date | null;
  type?: string | null;
  coverImage?: string | null;
}): OGImageData {
  const dateStr = article.publishedAt
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date(article.publishedAt))
    : undefined;

  const typeLabel = article.type
    ? article.type.charAt(0).toUpperCase() + article.type.slice(1)
    : undefined;

  return {
    title: article.title,
    date: dateStr,
    subtitle: typeLabel,
    coverImagePath: article.coverImage || undefined,
    type: "news",
  };
}
