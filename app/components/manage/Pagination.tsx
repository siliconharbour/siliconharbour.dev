import { Link, useSearchParams } from "react-router";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  total: number;
}

/**
 * Simple Previous/Next pagination for manage list pages.
 * Preserves existing query params (e.g. search `q`) when navigating pages.
 */
export function Pagination({ currentPage, totalPages, total }: PaginationProps) {
  const [searchParams] = useSearchParams();

  if (totalPages <= 1) return null;

  function buildPageUrl(page: number): string {
    const params = new URLSearchParams(searchParams);
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  }

  return (
    <div className="flex items-center justify-center gap-gap-2 mt-4">
      {currentPage > 1 && (
        <Link
          to={buildPageUrl(currentPage - 1)}
          className="px-pad-3 py-pad-1-5 text-sm text-body hover:text-heading border border-line hover:border-harbour-300"
        >
          Previous
        </Link>
      )}

      <span className="text-sm text-muted px-pad-3">
        Page {currentPage} of {totalPages} ({total} total)
      </span>

      {currentPage < totalPages && (
        <Link
          to={buildPageUrl(currentPage + 1)}
          className="px-pad-3 py-pad-1-5 text-sm text-body hover:text-heading border border-line hover:border-harbour-300"
        >
          Next
        </Link>
      )}
    </div>
  );
}
