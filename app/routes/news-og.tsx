import type { Route } from "./+types/news-og";
import { getNewsBySlug } from "~/lib/news.server";
import { generateOGImage, prepareNewsOGData } from "~/lib/og-image.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const slug = params.slug;

  const article = await getNewsBySlug(slug);
  if (!article) {
    throw new Response("Article not found", { status: 404 });
  }

  const ogData = prepareNewsOGData(article);
  const bypassCache = new URL(request.url).searchParams.has("preview");
  const pngBuffer = await generateOGImage(slug, ogData, { bypassCache });

  return new Response(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": bypassCache
        ? "no-store"
        : "public, max-age=86400, s-maxage=604800",
    },
  });
}
