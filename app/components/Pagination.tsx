import { Link, useSearchParams } from "react-router";

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
}

export function Pagination({ total, limit, offset }: PaginationProps) {
  const [searchParams] = useSearchParams();
  
  // Don't show pagination if all items fit on one page
  if (total <= limit) return null;
  
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  
  // Build URL with preserved search params
  const buildPageUrl = (page: number) => {
    const params = new URLSearchParams(searchParams);
    const newOffset = (page - 1) * limit;
    if (newOffset === 0) {
      params.delete("offset");
    } else {
      params.set("offset", String(newOffset));
    }
    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  };
  
  // Calculate page range to show (show up to 5 page numbers)
  const getPageRange = () => {
    const range: number[] = [];
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, currentPage + 2);
    
    // Adjust if we're near the beginning or end
    if (currentPage <= 3) {
      end = Math.min(5, totalPages);
    }
    if (currentPage >= totalPages - 2) {
      start = Math.max(1, totalPages - 4);
    }
    
    for (let i = start; i <= end; i++) {
      range.push(i);
    }
    return range;
  };
  
  const pageRange = getPageRange();
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;
  
  return (
    <nav className="flex items-center justify-center gap-1 mt-8" aria-label="Pagination">
      {/* Previous button */}
      {hasPrev ? (
        <Link
          to={buildPageUrl(currentPage - 1)}
          className="px-3 py-2 text-sm text-harbour-600 hover:text-harbour-700 hover:bg-harbour-50"
          aria-label="Previous page"
        >
          <span aria-hidden="true">&larr;</span> Prev
        </Link>
      ) : (
        <span className="px-3 py-2 text-sm text-harbour-300 cursor-not-allowed">
          <span aria-hidden="true">&larr;</span> Prev
        </span>
      )}
      
      {/* First page + ellipsis if needed */}
      {pageRange[0] > 1 && (
        <>
          <Link
            to={buildPageUrl(1)}
            className="px-3 py-2 text-sm text-harbour-600 hover:text-harbour-700 hover:bg-harbour-50"
          >
            1
          </Link>
          {pageRange[0] > 2 && (
            <span className="px-2 py-2 text-sm text-harbour-400">...</span>
          )}
        </>
      )}
      
      {/* Page numbers */}
      {pageRange.map(page => (
        <Link
          key={page}
          to={buildPageUrl(page)}
          className={`px-3 py-2 text-sm ${
            page === currentPage
              ? "bg-harbour-600 text-white"
              : "text-harbour-600 hover:text-harbour-700 hover:bg-harbour-50"
          }`}
          aria-current={page === currentPage ? "page" : undefined}
        >
          {page}
        </Link>
      ))}
      
      {/* Last page + ellipsis if needed */}
      {pageRange[pageRange.length - 1] < totalPages && (
        <>
          {pageRange[pageRange.length - 1] < totalPages - 1 && (
            <span className="px-2 py-2 text-sm text-harbour-400">...</span>
          )}
          <Link
            to={buildPageUrl(totalPages)}
            className="px-3 py-2 text-sm text-harbour-600 hover:text-harbour-700 hover:bg-harbour-50"
          >
            {totalPages}
          </Link>
        </>
      )}
      
      {/* Next button */}
      {hasNext ? (
        <Link
          to={buildPageUrl(currentPage + 1)}
          className="px-3 py-2 text-sm text-harbour-600 hover:text-harbour-700 hover:bg-harbour-50"
          aria-label="Next page"
        >
          Next <span aria-hidden="true">&rarr;</span>
        </Link>
      ) : (
        <span className="px-3 py-2 text-sm text-harbour-300 cursor-not-allowed">
          Next <span aria-hidden="true">&rarr;</span>
        </span>
      )}
    </nav>
  );
}

/**
 * Helper to parse pagination params from URL
 */
export function parsePaginationParams(
  url: URL,
  defaultLimit: number = 50
): { limit: number; offset: number } {
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");
  
  let limit = limitParam ? parseInt(limitParam, 10) : defaultLimit;
  let offset = offsetParam ? parseInt(offsetParam, 10) : 0;
  
  // Clamp values
  if (isNaN(limit) || limit < 1) limit = defaultLimit;
  if (limit > 200) limit = 200; // Max limit
  if (isNaN(offset) || offset < 0) offset = 0;
  
  return { limit, offset };
}
