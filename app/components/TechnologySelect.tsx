import { useState } from "react";
import type { Technology, TechnologyCategory } from "~/db/schema";
import { categoryLabels } from "~/lib/technology-categories";

interface TechnologySelectProps {
  technologies: Technology[];
  selectedIds: number[];
  name?: string;
}

export function TechnologySelect({
  technologies,
  selectedIds,
  name = "technologies",
}: TechnologySelectProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set(selectedIds));
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Group technologies by category
  const byCategory = technologies.reduce(
    (acc, tech) => {
      if (!acc[tech.category]) {
        acc[tech.category] = [];
      }
      acc[tech.category].push(tech);
      return acc;
    },
    {} as Record<TechnologyCategory, Technology[]>,
  );

  // Filter by search
  const searchLower = search.toLowerCase();
  const filteredByCategory = Object.entries(byCategory).reduce(
    (acc, [category, techs]) => {
      const filtered = techs.filter((t) => t.name.toLowerCase().includes(searchLower));
      if (filtered.length > 0) {
        acc[category as TechnologyCategory] = filtered;
      }
      return acc;
    },
    {} as Record<TechnologyCategory, Technology[]>,
  );

  const toggleTech = (id: number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const selectedTechs = technologies.filter((t) => selected.has(t.id));

  return (
    <div className="flex flex-col gap-gap-2">
      <label className="font-medium text-heading">Technologies</label>

      {/* Hidden inputs for form submission */}
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {/* Selected tags display */}
      {selectedTechs.length > 0 && (
        <div className="flex flex-wrap gap-gap-1-5 p-pad-2 bg-soft border border-line">
          {selectedTechs.map((tech) => (
            <button
              key={tech.id}
              type="button"
              onClick={() => toggleTech(tech.id)}
              className="inline-flex items-center gap-gap-1 px-pad-2 py-pad-0-5 bg-primary text-white text-sm hover:bg-primary-hover transition-colors"
            >
              {tech.name}
              <span className="text-harbour-300">&times;</span>
            </button>
          ))}
        </div>
      )}

      {/* Dropdown toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-pad-3 py-pad-2 border border-harbour-300 text-left text-body hover:border-harbour-400 transition-colors flex items-center justify-between"
      >
        <span>{selected.size === 0 ? "Select technologies..." : `${selected.size} selected`}</span>
        <span className="text-subtle">{isOpen ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="border border-harbour-300 bg-surface max-h-80 overflow-y-auto rounded-panel">
          {/* Search input */}
          <div className="p-pad-2 border-b border-line sticky top-0 bg-surface rounded-panel">
            <input
              type="text"
              placeholder="Search technologies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-pad-2 py-pad-1 border border-line text-sm focus:border-harbour-400 focus:outline-none"
            />
          </div>

          {/* Technology list by category */}
          <div className="p-pad-2">
            {Object.entries(filteredByCategory).length === 0 ? (
              <p className="text-sm text-subtle p-pad-2">No technologies found</p>
            ) : (
              Object.entries(filteredByCategory).map(([category, techs]) => (
                <div key={category} className="mb-3 last:mb-0">
                  <h4 className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
                    {categoryLabels[category as TechnologyCategory]}
                  </h4>
                  <div className="flex flex-wrap gap-gap-1">
                    {techs.map((tech) => (
                      <button
                        key={tech.id}
                        type="button"
                        onClick={() => toggleTech(tech.id)}
                        className={`px-pad-2 py-pad-0-5 text-sm border transition-colors ${
                          selected.has(tech.id)
                            ? "bg-primary text-white border-harbour-600"
                            : "bg-surface text-heading border-line hover:border-harbour-400"
                        }`}
                      >
                        {tech.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-subtle">
        Click to select/deselect technologies used by this company
      </p>
    </div>
  );
}
