import type { ReactNode } from "react";
import { Link } from "react-router";
import { Pagination } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";

interface DirectoryListPageProps {
  isAdmin: boolean;
  adminCreateTo: string;
  adminCreateLabel: string;
  searchPlaceholder: string;
  searchQuery: string;
  total: number;
  limit: number;
  offset: number;
  emptyMessage: string;
  emptySearchMessage: string;
  hasItems: boolean;
  children: ReactNode;
}

export function DirectoryListPage({
  isAdmin,
  adminCreateTo,
  adminCreateLabel,
  searchPlaceholder,
  searchQuery,
  total,
  limit,
  offset,
  emptyMessage,
  emptySearchMessage,
  hasItems,
  children,
}: DirectoryListPageProps) {
  return (
    <div className="flex flex-col gap-gap-6">
      {isAdmin && (
        <div className="flex justify-end">
          <Link
            to={adminCreateTo}
            className="px-pad-3 py-pad-1-5 text-sm bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            + {adminCreateLabel}
          </Link>
        </div>
      )}

      {(total > limit || searchQuery) && (
        <div className="flex flex-col gap-gap-2">
          <SearchInput placeholder={searchPlaceholder} />
          {searchQuery && (
            <p className="text-sm text-muted">
              {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}
        </div>
      )}

      {hasItems ? (
        children
      ) : (
        <p className="text-subtle">{searchQuery ? emptySearchMessage : emptyMessage}</p>
      )}

      <Pagination total={total} limit={limit} offset={offset} />
    </div>
  );
}
