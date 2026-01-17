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

// Load logo SVG and convert to base64
const logoSvg = readFileSync(join(process.cwd(), "public/siliconharbour.svg"));
const logoBase64 = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;

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
 * Load cover image for the content area (smaller, for the card style)
 */
async function loadCoverImageForCard(imagePath: string): Promise<string | null> {
  try {
    const fullPath = join(process.cwd(), "data/images", imagePath);
    if (!existsSync(fullPath)) {
      return null;
    }
    
    // Resize for card display area
    const buffer = await sharp(fullPath)
      .resize(400, 300, { fit: "cover" })
      .png()
      .toBuffer();
    
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Generate the OG image SVG using Satori
 * Design: White background, blue border, dark text, site logo
 */
async function generateSVG(data: OGImageData): Promise<string> {
  const coverImageBase64 = data.coverImagePath 
    ? await loadCoverImageForCard(data.coverImagePath)
    : null;

  const borderWidth = 3;
  const margin = 24;

  // Build the JSX element for Satori
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element: any = {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        padding: `${margin}px`,
        fontFamily: "Inter",
        backgroundColor: colors.white,
      },
      children: {
        type: "div",
        props: {
          style: {
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px",
            border: `${borderWidth}px solid ${colors.harbour600}`,
            borderRadius: "0",
          },
          children: [
            // Header with logo and site name
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                },
                children: [
                  // Logo and site name
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                      },
                      children: [
                        {
                          type: "img",
                          props: {
                            src: logoBase64,
                            width: 56,
                            height: 40,
                            style: {
                              objectFit: "contain",
                            },
                          },
                        },
                        {
                          type: "div",
                          props: {
                            style: {
                              fontSize: "24px",
                              fontWeight: 600,
                              color: colors.harbour700,
                            },
                            children: "siliconharbour.dev",
                          },
                        },
                      ],
                    },
                  },
                  // Type badge
                  {
                    type: "div",
                    props: {
                      style: {
                        backgroundColor: colors.harbour600,
                        color: colors.white,
                        padding: "8px 20px",
                        fontSize: "14px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      },
                      children: data.type === "event" ? "Event" : "News",
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
                  flex: 1,
                  alignItems: "center",
                  gap: "48px",
                  marginTop: "32px",
                },
                children: [
                  // Text content
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                        flex: 1,
                      },
                      children: [
                        // Title
                        {
                          type: "div",
                          props: {
                            style: {
                              fontSize: data.title.length > 50 ? "40px" : data.title.length > 30 ? "48px" : "56px",
                              fontWeight: 700,
                              color: colors.harbour700,
                              lineHeight: 1.15,
                            },
                            children: data.title,
                          },
                        },
                        // Date
                        data.date && {
                          type: "div",
                          props: {
                            style: {
                              fontSize: "22px",
                              color: colors.harbour500,
                              fontWeight: 500,
                            },
                            children: data.date,
                          },
                        },
                        // Location/Subtitle
                        data.subtitle && {
                          type: "div",
                          props: {
                            style: {
                              fontSize: "20px",
                              color: colors.harbour400,
                            },
                            children: data.subtitle,
                          },
                        },
                      ].filter(Boolean),
                    },
                  },
                  // Cover image (if exists)
                  coverImageBase64 && {
                    type: "div",
                    props: {
                      style: {
                        width: "280px",
                        height: "210px",
                        flexShrink: 0,
                        overflow: "hidden",
                        position: "relative",
                      },
                      children: [
                        {
                          type: "img",
                          props: {
                            src: coverImageBase64,
                            style: {
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            },
                          },
                        },
                        // Harbour tint overlay
                        {
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
                      ],
                    },
                  },
                ].filter(Boolean),
              },
            },
          ],
        },
      },
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
