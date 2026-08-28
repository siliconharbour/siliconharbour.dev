import type { Route } from "./+types/events-og";
import { getPublicEventBySlug } from "~/lib/events.server";
import { generateOGImage, prepareEventOGData } from "~/lib/og-image.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const slug = params.slug;

  const event = await getPublicEventBySlug(slug);
  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }

  const ogData = prepareEventOGData(event);
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
