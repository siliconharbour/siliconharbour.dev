import { useState, useEffect, useRef, useCallback } from "react";
import type { EntitySearchResult } from "~/routes/api/entities.search";

const TYPE_LABELS: Record<string, string> = {
  company: "Company",
  group: "Group",
  person: "Person",
  education: "Education",
};

const TYPE_COLORS: Record<string, string> = {
  company: "bg-blue-50 text-blue-700",
  group: "bg-green-50 text-green-700",
  person: "bg-purple-50 text-purple-700",
  education: "bg-amber-50 text-amber-700",
};

interface EntityPickerProps {
  name: string;
  defaultValue?: string;
  types?: string[];
  placeholder?: string;
  label?: string;
}

export function EntityPicker({
  name,
  defaultValue = "",
  types,
  placeholder = "Search for a company, group, person...",
  label,
}: EntityPickerProps) {
  const [selected, setSelected] = useState<string[]>(() =>
    defaultValue
      ? defaultValue
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  );

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setIsOpen(false);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({ q });
        if (types?.length) params.set("types", types.join(","));
        const res = await fetch(`/api/entities/search?${params}`);
        const data: EntitySearchResult[] = await res.json();
        setResults(data.filter((r) => !selected.includes(r.name)));
        setIsOpen(true);
      } finally {
        setLoading(false);
      }
    },
    [selected, types],
  );

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 200);
  }

  function selectItem(itemName: string) {
    setSelected((prev) => (prev.includes(itemName) ? prev : [...prev, itemName]));
    setQuery("");
    setResults([]);
    setIsOpen(false);
  }

  function remove(itemName: string) {
    setSelected((prev) => prev.filter((s) => s !== itemName));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && query.trim()) {
      e.preventDefault();
      selectItem(query.trim().replace(/,$/, ""));
    }
    if (e.key === "Backspace" && !query && selected.length > 0) {
      remove(selected[selected.length - 1]);
    }
  }

  const hiddenValue = selected.join(", ");

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-harbour-700">{label}</label>
      )}

      {/* Single hidden input — comma-separated string matching existing organizer wire */}
      <input type="hidden" name={name} value={hiddenValue} />

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query && setIsOpen(true)}
          placeholder={selected.length > 0 ? "Add another..." : placeholder}
          className="w-full px-3 py-2 border border-harbour-200 bg-white text-sm text-harbour-700 focus:outline-none focus:border-harbour-400"
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-harbour-400">
            …
          </span>
        )}

        {isOpen && results.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 border border-harbour-200 bg-white mt-px max-h-56 overflow-y-auto">
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectItem(r.name);
                }}
                className="w-full px-3 py-2 text-left text-sm text-harbour-700 hover:bg-harbour-50 flex items-center justify-between gap-2"
              >
                <span>{r.name}</span>
                <span
                  className={`text-xs px-1.5 py-0.5 shrink-0 ${TYPE_COLORS[r.type] ?? "bg-harbour-100 text-harbour-600"}`}
                >
                  {TYPE_LABELS[r.type] ?? r.type}
                </span>
              </button>
            ))}
          </div>
        )}

        {isOpen && !loading && query.trim() && results.length === 0 && (
          <div className="absolute z-50 top-full left-0 right-0 border border-harbour-200 bg-white mt-px px-3 py-2 text-sm text-harbour-400">
            No matches — press Enter to add &ldquo;{query.trim()}&rdquo; as free text
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-700"
            >
              {s}
              <button
                type="button"
                onClick={() => remove(s)}
                className="text-harbour-400 hover:text-harbour-700 leading-none"
                aria-label={`Remove ${s}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
