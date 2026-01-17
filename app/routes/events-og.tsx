import type { Route } from "./+types/events-og";
import { getEventBySlug } from "~/lib/events.server";
import { generateOGImage, prepareEventOGData } from "~/lib/og-image.server";

export async function loader({ params }: Route.LoaderArgs) {
  const slug = params.slug;
  
  const event = await getEventBySlug(slug);
  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }

  const ogData = prepareEventOGData(event);
  const pngBuffer = await generateOGImage(slug, ogData);

  return new Response(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
