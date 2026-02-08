import { parsePagination, paginatedJsonResponse, jsonResponse, notFoundResponse } from "~/lib/api.server";

interface PaginatedLoaderOptions<TItem, TResponseItem> {
  loadPage: (args: { limit: number; offset: number; url: URL }) => Promise<{
    items: TItem[];
    total: number;
  }>;
  mapItem: (item: TItem) => TResponseItem | Promise<TResponseItem>;
}

export function createPaginatedApiLoader<TItem, TResponseItem>({
  loadPage,
  mapItem,
}: PaginatedLoaderOptions<TItem, TResponseItem>) {
  return async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);
    const { items, total } = await loadPage({ limit, offset, url });

    const mappedItems = await Promise.all(items.map((item) => mapItem(item)));
    return paginatedJsonResponse(url, mappedItems, { total, limit, offset });
  };
}

interface DetailLoaderOptions<TEntity, TResponse> {
  entityName: string;
  loadBySlug: (slug: string) => Promise<TEntity | null>;
  mapEntity: (entity: TEntity) => TResponse | Promise<TResponse>;
}

export function createDetailApiLoader<TEntity, TResponse>({
  entityName,
  loadBySlug,
  mapEntity,
}: DetailLoaderOptions<TEntity, TResponse>) {
  return async ({ params }: { params: { slug: string } }) => {
    const entity = await loadBySlug(params.slug);
    if (!entity) {
      return notFoundResponse(`${entityName} not found`);
    }

    return jsonResponse(await mapEntity(entity));
  };
}
