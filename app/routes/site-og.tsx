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

const logoSvg = readFileSync(join(process.cwd(), "public/siliconharbour.svg"));
const logoBase64 = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;

const colors = {
  harbour50: "#e8f0ff",
  harbour500: "#4166e2",
  harbour600: "#2b51d1",
  harbour700: "#2144bb",
  white: "#ffffff",
};

async function generateSiteOG(): Promise<Buffer> {
  if (existsSync(CACHE_PATH)) {
    return readFileSync(CACHE_PATH);
  }

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
                src: logoBase64,
                width: 120,
                height: 86,
                style: { objectFit: "contain" },
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
    fonts: [
      { name: "Inter", data: interRegular, weight: 400, style: "normal" as const },
      { name: "Inter", data: interBold, weight: 700, style: "normal" as const },
    ],
  });

  const pngBuffer = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();

  await writeFile(CACHE_PATH, pngBuffer);
  return pngBuffer;
}

export async function loader() {
  const pngBuffer = await generateSiteOG();

  return new Response(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
