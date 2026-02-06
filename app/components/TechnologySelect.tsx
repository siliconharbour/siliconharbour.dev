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
    <div className="flex flex-col gap-2">
      <label className="font-medium text-harbour-700">Technologies</label>

      {/* Hidden inputs for form submission */}
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {/* Selected tags display */}
      {selectedTechs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 bg-harbour-50 border border-harbour-200">
          {selectedTechs.map((tech) => (
            <button
              key={tech.id}
              type="button"
              onClick={() => toggleTech(tech.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-harbour-600 text-white text-sm hover:bg-harbour-700 transition-colors"
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
        className="px-3 py-2 border border-harbour-300 text-left text-harbour-600 hover:border-harbour-400 transition-colors flex items-center justify-between"
      >
        <span>
          {selected.size === 0
            ? "Select technologies..."
            : `${selected.size} selected`}
        </span>
        <span className="text-harbour-400">{isOpen ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="border border-harbour-300 bg-white max-h-80 overflow-y-auto">
          {/* Search input */}
          <div className="p-2 border-b border-harbour-200 sticky top-0 bg-white">
            <input
              type="text"
              placeholder="Search technologies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1 border border-harbour-200 text-sm focus:border-harbour-400 focus:outline-none"
            />
          </div>

          {/* Technology list by category */}
          <div className="p-2">
            {Object.entries(filteredByCategory).length === 0 ? (
              <p className="text-sm text-harbour-400 p-2">No technologies found</p>
            ) : (
              Object.entries(filteredByCategory).map(([category, techs]) => (
                <div key={category} className="mb-3 last:mb-0">
                  <h4 className="text-xs font-medium text-harbour-500 uppercase tracking-wide mb-1">
                    {categoryLabels[category as TechnologyCategory]}
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {techs.map((tech) => (
                      <button
                        key={tech.id}
                        type="button"
                        onClick={() => toggleTech(tech.id)}
                        className={`px-2 py-0.5 text-sm border transition-colors ${
                          selected.has(tech.id)
                            ? "bg-harbour-600 text-white border-harbour-600"
                            : "bg-white text-harbour-700 border-harbour-200 hover:border-harbour-400"
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

      <p className="text-xs text-harbour-400">
        Click to select/deselect technologies used by this company
      </p>
    </div>
  );
}
