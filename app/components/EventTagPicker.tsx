import type { EventTag } from "~/db/schema";

interface EventTagPickerProps {
  availableTags: EventTag[];
  selectedTags?: EventTag[];
}

export function EventTagPicker({ availableTags, selectedTags = [] }: EventTagPickerProps) {
  if (availableTags.length === 0) return null;

  const selectedIds = new Set(selectedTags.map((tag) => tag.id));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-harbour-700">Tags (optional)</legend>
      <div className="flex flex-wrap gap-2">
        {availableTags.map((tag) => (
          <label
            key={tag.id}
            className="flex cursor-pointer items-center gap-2 border border-harbour-200 bg-white px-3 py-2 text-sm text-harbour-700 hover:border-harbour-300"
          >
            <input
              type="checkbox"
              name="tagIds"
              value={tag.id}
              defaultChecked={selectedIds.has(tag.id)}
              className="h-4 w-4 border-harbour-300 text-harbour-600 focus:ring-harbour-500"
            />
            {tag.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
