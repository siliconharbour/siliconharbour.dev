import type { Route } from "./+types/education.$slug";
import { db } from "~/db";
import { education } from "~/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, imageUrl, contentUrl } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const [inst] = await db.select().from(education).where(eq(education.slug, params.slug));

  if (!inst) {
    return jsonResponse({ error: "Education resource not found" }, { status: 404 });
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
    url: contentUrl("education", inst.slug),
    createdAt: inst.createdAt.toISOString(),
    updatedAt: inst.updatedAt.toISOString(),
  });
}
