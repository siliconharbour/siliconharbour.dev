import satori from "satori";
import sharp from "sharp";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { IMAGES_DIR } from "./paths.server";
import { formatInTimezone } from "./timezone";

// OG Image dimensions (standard)
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_RENDER_VERSION = 3;

// Cache directory
const CACHE_DIR = join(tmpdir(), "siliconharbour-og");

// Ensure cache directory exists
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

// Load fonts once at module init
const interRegular = readFileSync(join(process.cwd(), "app/assets/fonts/Inter-Regular.ttf"));
const interBold = readFileSync(join(process.cwd(), "app/assets/fonts/Inter-Bold.ttf"));

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

export interface OGImageData {
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
    .update(JSON.stringify({ version: OG_RENDER_VERSION, data }))
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
    const fullPath = join(process.cwd(), IMAGES_DIR, imagePath);
    if (!existsSync(fullPath)) {
      return null;
    }

    // Normalize to the exact card aspect ratio once. The soft full-bleed
    // background fills the frame while the foreground remains entirely visible,
    // which works for panoramas, posters, logos, and screenshots alike.
    const background = await sharp(fullPath)
      .resize(840, 600, { fit: "cover" })
      .blur(24)
      .modulate({ brightness: 0.7, saturation: 0.8 })
      .png()
      .toBuffer();
    const foreground = await sharp(fullPath)
      .resize(840, 600, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    const buffer = await sharp(background)
      .composite([{ input: foreground, gravity: "centre" }])
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
                  justifyContent: "flex-start",
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
                              fontSize: "28px",
                              fontWeight: 600,
                              color: colors.harbour700,
                            },
                            children: "siliconharbour.dev",
                          },
                        },
                      ],
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
                  flexDirection: "row",
                  flex: 1,
                  alignItems: "center",
                  gap: "40px",
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
                              fontSize:
                                data.title.length > 50
                                  ? "46px"
                                  : data.title.length > 30
                                    ? "54px"
                                    : "64px",
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
                              fontSize: "25px",
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
                              fontSize: "23px",
                              color: colors.harbour400,
                            },
                            children: data.subtitle,
                          },
                        },
                      ].filter(Boolean),
                    },
                  },
                  // A consistent 4:3 media card for both events and news.
                  coverImageBase64 && {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        width: "500px",
                        height: "350px",
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
                              objectFit: "contain",
                            },
                          },
                        },
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
  data: OGImageData,
  options: { bypassCache?: boolean } = {},
): Promise<Buffer> {
  // Check cache first
  const cachedPath = options.bypassCache ? null : getCachedImage(slug, data);
  if (cachedPath) {
    return readFileSync(cachedPath);
  }

  // Generate SVG
  const svg = await generateSVG(data);

  // Convert SVG to PNG using Sharp
  const pngBuffer = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();

  // Save to cache
  const cachePath = getCachePath(slug, data);
  if (!options.bypassCache) {
    await writeFile(cachePath, pngBuffer);
  }

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
  dates: { startDate: Date; endDate?: Date | null; isAllDay?: boolean }[];
  location?: string | null;
  coverImage?: string | null;
  timeMode?: "scheduled" | "period";
}): OGImageData {
  const firstDate = event.dates[0];
  const lastDate = event.dates.length > 1 ? event.dates[event.dates.length - 1] : null;

  let dateStr: string | undefined;

  if (firstDate && lastDate) {
    // Multiple dates: show the date range from earliest start to latest
    // end. Date-only is already the format used here, so all-day vs
    // timed is irrelevant for the range header.
    const allTimestamps = event.dates.flatMap((d) =>
      [d.startDate.getTime(), d.endDate?.getTime()].filter((t): t is number => t != null),
    );
    const rangeEnd = new Date(Math.max(...allTimestamps));

    const startStr = formatInTimezone(firstDate.startDate, "MMMM d");
    const startYear = formatInTimezone(firstDate.startDate, "yyyy");
    const endYear = formatInTimezone(rangeEnd, "yyyy");
    if (startYear === endYear) {
      dateStr = `${startStr} – ${formatInTimezone(rangeEnd, "MMMM d, yyyy")}`;
    } else {
      const startWithYear = formatInTimezone(firstDate.startDate, "MMMM d, yyyy");
      dateStr = `${startWithYear} – ${formatInTimezone(rangeEnd, "MMMM d, yyyy")}`;
    }
  } else if (firstDate?.endDate) {
    // Single date with end. All-day spans render as a date range.
    if (firstDate.isAllDay) {
      const startDay = formatInTimezone(firstDate.startDate, "MMMM d");
      const endDay = formatInTimezone(firstDate.endDate, "MMMM d, yyyy");
      dateStr = `${startDay} – ${endDay}`;
    } else {
      const dayStr = formatInTimezone(firstDate.startDate, "EEEE, MMMM d, yyyy");
      const startTime = formatInTimezone(firstDate.startDate, "h:mm a");
      const endTime = formatInTimezone(firstDate.endDate, "h:mm a");
      dateStr = `${dayStr} · ${startTime} – ${endTime}`;
    }
  } else if (firstDate) {
    // Single date, no end. All-day drops the time suffix.
    dateStr = firstDate.isAllDay
      ? formatInTimezone(firstDate.startDate, "EEEE, MMMM d, yyyy")
      : formatInTimezone(firstDate.startDate, "EEEE, MMMM d, yyyy 'at' h:mm a");
  }

  return {
    title: event.title,
    date: dateStr,
    subtitle:
      event.timeMode === "period"
        ? ["Time period", event.location].filter(Boolean).join(" · ")
        : event.location || undefined,
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
  sourceName?: string | null;
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

  const typeLabel = article.type === "link" ? article.sourceName || "Link" : "Article";

  return {
    title: article.title,
    date: dateStr,
    subtitle: typeLabel,
    coverImagePath: article.coverImage || undefined,
    type: "news",
  };
}
