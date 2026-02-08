import type { ContentType } from "~/db/schema";

const contentTypeRoutes: Record<ContentType, string> = {
  event: "/events",
  company: "/directory/companies",
  group: "/directory/groups",
  education: "/directory/education",
  person: "/directory/people",
  news: "/news",
  job: "/jobs",
  project: "/directory/projects",
  product: "/directory/products",
};

export function getContentUrl(type: ContentType, slug: string): string {
  return `${contentTypeRoutes[type]}/${slug}`;
}
