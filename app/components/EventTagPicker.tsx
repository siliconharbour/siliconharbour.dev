import type { EventTag } from "~/db/schema";

interface EventTagPickerProps {
  availableTags: EventTag[];
  selectedTags?: EventTag[];
}

export function EventTagPicker({ availableTags, selectedTags = [] }: EventTagPickerProps) {
  if (availableTags.length === 0) return null;

  const selectedIds = new Set(selectedTags.map((tag) => tag.id));

  return (
    <fieldset className="flex flex-col gap-gap-2">
      <legend className="text-sm font-medium text-heading">Tags (optional)</legend>
      <div className="flex flex-wrap gap-gap-2">
        {availableTags.map((tag) => (
          <label
            key={tag.id}
            className="flex cursor-pointer items-center gap-gap-2 border border-line bg-surface px-pad-3 py-pad-2 text-sm text-heading hover:border-harbour-300"
          >
            <input
              type="checkbox"
              name="tagIds"
              value={tag.id}
              defaultChecked={selectedIds.has(tag.id)}
              className="h-4 w-4 border-harbour-300 text-body focus:ring-harbour-500"
            />
            {tag.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
