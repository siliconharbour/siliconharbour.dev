import {
  OG_LOGO_ID,
  logoBounds,
  ogPreviewResponse,
  type LogoBounds,
} from "~/lib/og-preview.server";
import { BRAND_LOGO, DEFAULT_OG_COLORS } from "~/theme/tokens";
import type { Route } from "./+types/site-og";
import satori from "satori";
import sharp from "sharp";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const CACHE_DIR = join(tmpdir(), "siliconharbour-og");
const CACHE_PATH = join(CACHE_DIR, "site-og.png");

if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

const interRegular = readFileSync(join(process.cwd(), "app/assets/fonts/Inter-Regular.ttf"));
const interBold = readFileSync(join(process.cwd(), "app/assets/fonts/Inter-Bold.ttf"));

const logoSvg = readFileSync(join(process.cwd(), `public${BRAND_LOGO}`));
const logoBase64 = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;

const colors = DEFAULT_OG_COLORS;

async function generateSiteSVG(preview = false) {
  let logo: LogoBounds | undefined;
  const margin = 24;
  const borderWidth = 3;

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
            justifyContent: "center",
            alignItems: "center",
            padding: "48px",
            border: `${borderWidth}px solid ${colors.harbour600}`,
            gap: "32px",
          },
          children: [
            {
              type: "img",
              props: {
                id: OG_LOGO_ID,
                src: logoBase64,
                width: 120,
                height: 86,
                style: { objectFit: "contain", opacity: preview ? 0 : 1 },
              },
            },
            {
              type: "div",
              props: {
                style: {
                  fontSize: "48px",
                  fontWeight: 700,
                  color: colors.harbour700,
                },
                children: "siliconharbour.dev",
              },
            },
            {
              type: "div",
              props: {
                style: {
                  fontSize: "26px",
                  fontWeight: 400,
                  color: colors.harbour500,
                  textAlign: "center",
                  maxWidth: "800px",
                  lineHeight: 1.4,
                },
                children: "Discover the tech scene in St. John's, NL",
              },
            },
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  gap: "16px",
                  marginTop: "8px",
                },
                children: ["Events", "Companies", "Jobs", "Groups", "People"].map((label) => ({
                  type: "div",
                  props: {
                    style: {
                      backgroundColor: colors.harbour50,
                      color: colors.harbour600,
                      padding: "8px 20px",
                      fontSize: "16px",
                      fontWeight: 600,
                    },
                    children: label,
                  },
                })),
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
    onNodeDetected: (node) => {
      logo = logoBounds(node) ?? logo;
    },
    fonts: [
      { name: "Inter", data: interRegular, weight: 400, style: "normal" as const },
      { name: "Inter", data: interBold, weight: 700, style: "normal" as const },
    ],
  });

  if (!logo) throw new Error("OG logo layout was not found");
  return { svg, logo };
}

async function generateSiteOG(bypassCache = false): Promise<Buffer> {
  if (!bypassCache && existsSync(CACHE_PATH)) return readFileSync(CACHE_PATH);
  const { svg } = await generateSiteSVG();
  const pngBuffer = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
  if (!bypassCache) await writeFile(CACHE_PATH, pngBuffer);
  return pngBuffer;
}

export async function loader({ request }: Route.LoaderArgs) {
  const query = new URL(request.url).searchParams;
  if (query.get("preview") === "template") {
    return ogPreviewResponse(await generateSiteSVG(true));
  }
  const bypassCache = query.has("preview");
  const pngBuffer = await generateSiteOG(bypassCache);

  return new Response(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": bypassCache ? "no-store" : "public, max-age=86400, s-maxage=604800",
    },
  });
}
