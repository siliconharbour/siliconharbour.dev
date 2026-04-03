# Entity Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable `EntityPicker` component that lets users search across companies, groups, people, and education to populate the event organizer field (and other comma-separated reference fields).

**Architecture:** A new `GET /api/entities/search?q=...&types=...` endpoint does `LIKE '%q%'` across the relevant tables and returns `{id, name, type, slug}[]`. A new `EntityPicker` React component wraps `@base-ui/react/select` with an inline text filter input — no external state library needed (the dataset is small). It emits the selected names as a comma-separated hidden input, matching the existing `organizer` wire exactly. `EventForm.tsx` swaps the plain text input for `EntityPicker`. No schema changes, no new dependencies beyond what's already installed.

**Tech Stack:** Drizzle ORM (SQLite LIKE queries), React Router v7 loader pattern, `@base-ui/react/select` (already installed), Tailwind CSS harbour-* design system.

---

## File Map

**New files:**
- `app/routes/api/entities.search.tsx` — search endpoint
- `app/components/EntityPicker.tsx` — reusable picker component

**Modified files:**
- `app/routes.ts` — register new API route
- `app/components/EventForm.tsx` — swap organizer input for EntityPicker

---

## Task 1: Search API Endpoint

**Files:**
- Create: `app/routes/api/entities.search.tsx`
- Modify: `app/routes.ts`

The endpoint accepts `?q=<query>&types=<comma-separated-types>` and returns matching entities across companies, groups, people, and education. Types defaults to all four if omitted.

- [ ] **Step 1: Register route in `app/routes.ts`**

Read `app/routes.ts`. In the Public JSON API section (near line 60), add:

```typescript
route("api/entities/search", "routes/api/entities.search.tsx"),
```

- [ ] **Step 2: Create `app/routes/api/entities.search.tsx`**

```typescript
import type { Route } from "./+types/entities.search";
import { db } from "~/db";
import { companies, groups, people, education } from "~/db/schema";
import { like, or } from "drizzle-orm";

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

  // Sort alphabetically
  results.sort((a, b) => a.name.localeCompare(b.name));

  return Response.json(results);
}
```

- [ ] **Step 3: Verify build and smoke test**

```bash
pnpm run build 2>&1 | grep -E "^.*error" | grep -v "node_modules" | head -10
```

Then start dev server and test:
```bash
curl "http://localhost:5173/api/entities/search?q=tech"
```
Expected: JSON array of matching entities.

- [ ] **Step 4: Commit**

```bash
git add app/routes/api/entities.search.tsx app/routes.ts
git commit -m "feat: add entity search API endpoint"
```

---

## Task 2: EntityPicker Component

**Files:**
- Create: `app/components/EntityPicker.tsx`

The component renders a combobox-style picker: a text input for filtering, a dropdown list of results (fetched via `fetch` with debounce), selected items shown as removable chips below, and hidden inputs for form submission.

The `value` is always the **name string** (not ID) to stay compatible with the existing `organizer` comma-separated string wire. The hidden input emits `name="organizer"` once per selected entity, and the server reads them as `formData.getAll("organizer").join(", ")` — but wait, `parseEventBaseForm` uses `formData.get("organizer")` (single value). So we need to submit a single hidden input with the joined comma-separated string. See Step 1 below for the wire detail.

- [ ] **Step 1: Check the exact wire**

Read `app/lib/admin/manage-schemas.ts` around line 23–30 to confirm `organizer` is `formData.get("organizer")` (a single string). The component must emit a **single** `<input type="hidden" name="organizer" value="Name1, Name2">` not multiple inputs.

- [ ] **Step 2: Create `app/components/EntityPicker.tsx`**

```tsx
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
  name: string;                   // form field name, e.g. "organizer"
  defaultValue?: string;          // comma-separated initial value, e.g. "TechNest, CoLab"
  types?: string[];               // which entity types to search, defaults to all
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
  // Parse initial comma-separated names into selected array
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

  // Close dropdown on outside click
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
        // Filter out already-selected names
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

  function select(name: string) {
    setSelected((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setQuery("");
    setResults([]);
    setIsOpen(false);
  }

  function remove(name: string) {
    setSelected((prev) => prev.filter((s) => s !== name));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Allow typing a free-text name directly by pressing Enter or comma
    if ((e.key === "Enter" || e.key === ",") && query.trim()) {
      e.preventDefault();
      select(query.trim().replace(/,$/, ""));
    }
    // Backspace on empty query removes last chip
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

      {/* Hidden input — single comma-separated string matching existing wire */}
      <input type="hidden" name={name} value={hiddenValue} />

      {/* Search input */}
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

        {/* Dropdown */}
        {isOpen && results.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 border border-harbour-200 bg-white mt-px max-h-56 overflow-y-auto">
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent blur before click
                  select(r.name);
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
            No matches — press Enter to add "{query.trim()}" as free text
          </div>
        )}
      </div>

      {/* Selected chips */}
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
```

- [ ] **Step 3: Verify build**

```bash
pnpm run build 2>&1 | grep -E "^.*error" | grep -v "node_modules" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/EntityPicker.tsx
git commit -m "feat: add EntityPicker component with async search and free-text fallback"
```

---

## Task 3: Wire EntityPicker into EventForm

**Files:**
- Modify: `app/components/EventForm.tsx`

Replace the plain organizer `<input type="text">` with `<EntityPicker>`. The hidden input emitted by `EntityPicker` uses `name="organizer"` and submits a comma-separated string — identical to what the server already expects via `parseEventBaseForm`.

- [ ] **Step 1: Read the current organizer field in EventForm**

Read `app/components/EventForm.tsx` around lines 306–318 to confirm the exact code being replaced.

- [ ] **Step 2: Add the EntityPicker import**

At the top of `app/components/EventForm.tsx`, add:

```typescript
import { EntityPicker } from "~/components/EntityPicker";
```

- [ ] **Step 3: Replace the organizer input**

Find the organizer `<div>` block (lines ~306–320):

```tsx
{/* Organizer */}
<div>
  <label htmlFor="organizer" className="block text-sm font-medium mb-1 text-harbour-700">
    Organizer (optional)
  </label>
  <input
    type="text"
    id="organizer"
    name="organizer"
    defaultValue={event?.organizer || ""}
    className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
  />
</div>
```

Replace it with:

```tsx
{/* Organizer */}
<EntityPicker
  name="organizer"
  defaultValue={event?.organizer ?? ""}
  label="Organizer (optional)"
  placeholder="Search companies, groups, people..."
/>
```

- [ ] **Step 4: Verify build**

```bash
pnpm run build 2>&1 | grep -E "^.*error" | grep -v "node_modules" | head -10
```

Expected: no errors.

- [ ] **Step 5: Smoke test in browser**

Start dev server (`pnpm dev`) and navigate to any event edit page (e.g. `/manage/events/1`). Verify:
1. The organizer field shows chips for any existing organizer names
2. Typing in the search box shows a dropdown with type badges
3. Clicking a result adds it as a chip
4. Pressing Enter with a free-text query adds it as a chip (for names not in DB)
5. × on a chip removes it
6. Saving the form preserves the organizer string

- [ ] **Step 6: Commit**

```bash
git add app/components/EventForm.tsx
git commit -m "feat: replace organizer text input with EntityPicker in EventForm"
```

---

## Task 4: Quality Gates

- [ ] **Step 1: Lint fix**

```bash
pnpm run lint:fix
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 2: Full build**

```bash
pnpm run build
```

Expected: clean build, no errors.

- [ ] **Step 3: Final commit if any lint fixes were applied**

```bash
git add -A && git status
# Only commit if there are changes
git commit -m "fix: lint cleanup for entity picker"
```
