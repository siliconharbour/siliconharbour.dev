import type { Event } from "~/db/schema";

export type EventFormTiming = "onetime" | "recurring" | "period";

type EventTimingFieldsProps = {
  value: EventFormTiming;
  onChange: (value: EventFormTiming) => void;
  periodOptions: Array<Pick<Event, "id" | "title">>;
  parentEventId?: number | null;
};

const timingOptions: Array<{ value: EventFormTiming; label: string }> = [
  { value: "onetime", label: "One-time event" },
  { value: "recurring", label: "Recurring event" },
  { value: "period", label: "Time period" },
];

export function EventTimingFields({
  value,
  onChange,
  periodOptions,
  parentEventId,
}: EventTimingFieldsProps) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium mb-2 text-harbour-700">Event type *</label>
        <div className="flex flex-wrap gap-4">
          {timingOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="eventType"
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="accent-harbour-600"
              />
              <span className="text-harbour-600">{option.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm text-harbour-400">
          Use a time period for a jam, application window, or activity that runs for several days.
        </p>
      </div>

      {value !== "period" && periodOptions.length > 0 && (
        <div>
          <label
            htmlFor="parentEventId"
            className="block text-sm font-medium mb-1 text-harbour-700"
          >
            Part of a time period (optional)
          </label>
          <select
            id="parentEventId"
            name="parentEventId"
            defaultValue={parentEventId ?? ""}
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500"
          >
            <option value="">Standalone event</option>
            {periodOptions.map((period) => (
              <option key={period.id} value={period.id}>
                {period.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {value === "period" && <input type="hidden" name="parentEventId" value="" />}
    </>
  );
}
