import { Form } from "react-router";
import { eventTagColors } from "~/db/schema";
import type { EventTagWithUsage } from "~/lib/event-tags.server";
import { eventTagColorLabels, eventTagColorStyles } from "~/lib/event-tags";

interface EventTagSettingsProps {
  tags: EventTagWithUsage[];
  error?: string;
}

export function EventTagSettings({ tags, error }: EventTagSettingsProps) {
  return (
    <section className="border border-harbour-200 bg-white p-6">
      <h2 className="mb-2 text-lg font-semibold text-harbour-700">Event tags</h2>
      <p className="mb-5 text-sm text-harbour-400">
        Create optional labels for event cards and pages. Colours are limited to the site palette.
      </p>

      {error && (
        <p className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <div className="mb-5 flex flex-col gap-3">
        {tags.length === 0 && (
          <p className="text-sm text-harbour-400">No event tags configured.</p>
        )}
        {tags.map((tag) => (
          <Form key={tag.id} method="post" className="border border-harbour-100 p-3">
            <input type="hidden" name="tagId" value={tag.id} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_auto_auto] sm:items-end">
              <label className="flex flex-col gap-1 text-sm font-medium text-harbour-700">
                Name
                <input
                  name="name"
                  defaultValue={tag.name}
                  required
                  className="border border-harbour-200 bg-white px-3 py-2 font-normal focus:border-harbour-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-harbour-700">
                Colour
                <select
                  name="color"
                  defaultValue={tag.color}
                  className="border border-harbour-200 bg-white px-3 py-2 font-normal focus:border-harbour-500 focus:outline-none"
                >
                  {eventTagColors.map((color) => (
                    <option key={color} value={color}>
                      {eventTagColorLabels[color]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                name="intent"
                value="update-event-tag"
                className="border border-harbour-200 px-3 py-2 text-sm text-harbour-700 hover:bg-harbour-50"
              >
                Save
              </button>
              <button
                name="intent"
                value="delete-event-tag"
                onClick={(event) => {
                  if (!window.confirm(`Delete the "${tag.name}" event tag?`)) {
                    event.preventDefault();
                  }
                }}
                className="border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-harbour-400">
              <span className={`px-1.5 py-0.5 ${eventTagColorStyles[tag.color]}`}>
                {tag.name}
              </span>
              <span>
                Used by {tag.eventCount} event{tag.eventCount === 1 ? "" : "s"}
              </span>
            </div>
          </Form>
        ))}
      </div>

      <Form method="post" className="border-t border-harbour-100 pt-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-sm font-medium text-harbour-700">
            New tag
            <input
              name="name"
              required
              placeholder="Game jam"
              className="border border-harbour-200 bg-white px-3 py-2 font-normal focus:border-harbour-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-harbour-700">
            Colour
            <select
              name="color"
              defaultValue="harbour"
              className="border border-harbour-200 bg-white px-3 py-2 font-normal focus:border-harbour-500 focus:outline-none"
            >
              {eventTagColors.map((color) => (
                <option key={color} value={color}>
                  {eventTagColorLabels[color]}
                </option>
              ))}
            </select>
          </label>
          <button
            name="intent"
            value="add-event-tag"
            className="bg-harbour-600 px-3 py-2 text-sm text-white hover:bg-harbour-700"
          >
            Add tag
          </button>
        </div>
      </Form>
    </section>
  );
}
