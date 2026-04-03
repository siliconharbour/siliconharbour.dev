import type { Route } from "./+types/entities.search";
import { db } from "~/db";
import { companies, groups, people, education } from "~/db/schema";
import { like } from "drizzle-orm";

export type EntitySearchResult = {
  id: number;
  name: string;
  type: "company" | "group" | "person" | "education";
  slug: string;
};

const ALL_TYPES = ["company", "group", "person", "education"] as const;
type EntityType = (typeof ALL_TYPES)[number];

export async function loader({ request }: Route.LoaderArgs): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const typesParam = url.searchParams.get("types");
  const types: EntityType[] = typesParam
    ? (typesParam.split(",").filter((t) => ALL_TYPES.includes(t as EntityType)) as EntityType[])
    : [...ALL_TYPES];

  if (q.length < 1) {
    return Response.json([]);
  }

  const pattern = `%${q}%`;
  const results: EntitySearchResult[] = [];

  if (types.includes("company")) {
    const rows = await db
      .select({ id: companies.id, name: companies.name, slug: companies.slug })
      .from(companies)
      .where(like(companies.name, pattern))
      .limit(10);
    results.push(...rows.map((r) => ({ ...r, type: "company" as const })));
  }

  if (types.includes("group")) {
    const rows = await db
      .select({ id: groups.id, name: groups.name, slug: groups.slug })
      .from(groups)
      .where(like(groups.name, pattern))
      .limit(10);
    results.push(...rows.map((r) => ({ ...r, type: "group" as const })));
  }

  if (types.includes("person")) {
    const rows = await db
      .select({ id: people.id, name: people.name, slug: people.slug })
      .from(people)
      .where(like(people.name, pattern))
      .limit(10);
    results.push(...rows.map((r) => ({ ...r, type: "person" as const })));
  }

  if (types.includes("education")) {
    const rows = await db
      .select({ id: education.id, name: education.name, slug: education.slug })
      .from(education)
      .where(like(education.name, pattern))
      .limit(10);
    results.push(...rows.map((r) => ({ ...r, type: "education" as const })));
  }

  results.sort((a, b) => a.name.localeCompare(b.name));

  return Response.json(results);
}
