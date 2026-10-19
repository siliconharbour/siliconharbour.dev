import type { Route } from "./+types/theme-shares.$id.logo";
import { themeShareLogo } from "~/lib/theme-shares.server";
export function loader({ params }: Route.LoaderArgs) {
  const bytes = themeShareLogo(params.id);
  if (!bytes) throw new Response("No logo", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
