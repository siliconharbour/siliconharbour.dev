import { listPageToMarkdown, markdownResponse } from "./markdown.server";
import { parseMarkdownListParams } from "./public-query.server";

interface MarkdownListItem {
  slug: string | null;
  url?: string | null;
  name: string;
  description?: string | null;
}

interface MarkdownListResponseOptions {
  request: Request;
  title: string;
  description: string;
  entityType: "company" | "education" | "group" | "person" | "product" | "project" | "event" | "news" | "job";
  basePath: string;
  items: MarkdownListItem[];
  total: number;
  apiPath?: string;
}

export function buildMarkdownListResponse({
  request,
  title,
  description,
  entityType,
  basePath,
  items,
  total,
  apiPath,
}: MarkdownListResponseOptions) {
  const { limit, offset, searchQuery } = parseMarkdownListParams(new URL(request.url));

  return markdownResponse(
    listPageToMarkdown({
      title,
      description,
      items,
      entityType,
      basePath,
      apiPath,
      total,
      limit,
      offset,
      searchQuery,
    }),
  );
}
