import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface SearchInputProps {
  placeholder?: string;
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Additional hidden form fields to preserve */
  preserveParams?: string[];
}

export function SearchInput({
  placeholder = "Search...",
  debounceMs = 300,
  preserveParams = [],
}: SearchInputProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQuery = searchParams.get("q") || "";
  const [value, setValue] = useState(initialQuery);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update local state if URL changes externally (e.g., back button)
  useEffect(() => {
    setValue(searchParams.get("q") || "");
  }, [searchParams]);

  const performSearch = (query: string) => {
    const params = new URLSearchParams();

    // Preserve specified params
    for (const param of preserveParams) {
      const val = searchParams.get(param);
      if (val) params.set(param, val);
    }

    // Set search query (or remove if empty)
    if (query.trim()) {
      params.set("q", query.trim());
    }

    // Reset to first page when searching
    params.delete("offset");

    const queryString = params.toString();
    const readableQuery = queryString.replaceAll("%7C", "|");
    navigate(readableQuery ? `?${readableQuery}` : "", { replace: true });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new debounced search
    timeoutRef.current = setTimeout(() => {
      performSearch(newValue);
    }, debounceMs);
  };

  const handleClear = () => {
    setValue("");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    performSearch("");
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex gap-gap-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full px-pad-3 py-pad-2 text-sm border border-line focus:border-harbour-400 focus:outline-none text-heading pr-pad-8"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-body"
            aria-label="Clear search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
