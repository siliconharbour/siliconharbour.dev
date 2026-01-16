import type { Route } from "./+types/learning.$slug";
import { db } from "~/db";
import { learning } from "~/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, imageUrl, contentUrl } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const [inst] = await db
    .select()
    .from(learning)
    .where(eq(learning.slug, params.slug));
  
  if (!inst) {
    return jsonResponse({ error: "Learning resource not found" }, { status: 404 });
  }
  
  return jsonResponse({
    id: inst.id,
    slug: inst.slug,
    name: inst.name,
    description: inst.description,
    type: inst.type,
    website: inst.website,
    logo: imageUrl(inst.logo),
    coverImage: imageUrl(inst.coverImage),
    url: contentUrl("learning", inst.slug),
    createdAt: inst.createdAt.toISOString(),
    updatedAt: inst.updatedAt.toISOString(),
  });
}
