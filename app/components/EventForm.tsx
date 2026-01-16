import { useState, useCallback } from "react";
import { Form } from "react-router";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format } from "date-fns";
import { ImageCropper } from "./ImageCropper";
import type { Event, EventDate } from "~/db/schema";

type EventFormProps = {
  event?: Event & { dates: EventDate[] };
  error?: string;
};

type DateEntry = {
  id: string;
  startDate: Date;
  startTime: string;
  endDate: Date | null;
  endTime: string;
  isRange: boolean;
};

export function EventForm({ event, error }: EventFormProps) {
  const [dates, setDates] = useState<DateEntry[]>(() => {
    if (event?.dates.length) {
      return event.dates.map((d, i) => ({
        id: `existing-${i}`,
        startDate: d.startDate,
        startTime: format(d.startDate, "HH:mm"),
        endDate: d.endDate,
        endTime: d.endDate ? format(d.endDate, "HH:mm") : "",
        isRange: !!d.endDate,
      }));
    }
    return [
      {
        id: "new-0",
        startDate: new Date(),
        startTime: "18:00",
        endDate: null,
        endTime: "",
        isRange: false,
      },
    ];
  });

  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(
    event?.coverImage ? `/images/${event.coverImage}` : null
  );
  const [iconImagePreview, setIconImagePreview] = useState<string | null>(
    event?.iconImage ? `/images/${event.iconImage}` : null
  );

  const [cropperState, setCropperState] = useState<{
    type: "cover" | "icon";
    src: string;
    file: File;
  } | null>(null);

  const [coverImageData, setCoverImageData] = useState<string | null>(null);
  const [iconImageData, setIconImageData] = useState<string | null>(null);

  const [activeDatePicker, setActiveDatePicker] = useState<string | null>(null);

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "cover" | "icon"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCropperState({
        type,
        src: reader.result as string,
        file,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropComplete = useCallback(
    (blob: Blob) => {
      if (!cropperState) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        if (cropperState.type === "cover") {
          setCoverImagePreview(dataUrl);
          setCoverImageData(dataUrl);
        } else {
          setIconImagePreview(dataUrl);
          setIconImageData(dataUrl);
        }
        setCropperState(null);
      };
      reader.readAsDataURL(blob);
    },
    [cropperState]
  );

  const addDate = () => {
    setDates([
      ...dates,
      {
        id: `new-${Date.now()}`,
        startDate: new Date(),
        startTime: "18:00",
        endDate: null,
        endTime: "",
        isRange: false,
      },
    ]);
  };

  const removeDate = (id: string) => {
    if (dates.length > 1) {
      setDates(dates.filter((d) => d.id !== id));
    }
  };

  const updateDate = (id: string, updates: Partial<DateEntry>) => {
    setDates(dates.map((d) => (d.id === id ? { ...d, ...updates } : d)));
  };

  return (
    <>
      <Form method="post" className="space-y-6">
        {error && (
          <div className="p-3 bg-red-100 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1 text-harbour-700">
            Title *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            required
            defaultValue={event?.title}
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1 text-harbour-700">
            Description * (Markdown supported)
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={5}
            defaultValue={event?.description}
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent font-mono text-sm"
          />
        </div>

        {/* Link */}
        <div>
          <label htmlFor="link" className="block text-sm font-medium mb-1 text-harbour-700">
            Event Link *
          </label>
          <input
            type="url"
            id="link"
            name="link"
            required
            defaultValue={event?.link}
            placeholder="https://..."
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
          />
        </div>

        {/* Location */}
        <div>
          <label htmlFor="location" className="block text-sm font-medium mb-1 text-harbour-700">
            Location (optional)
          </label>
          <input
            type="text"
            id="location"
            name="location"
            defaultValue={event?.location || ""}
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
          />
        </div>

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

        {/* Images */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cover Image */}
          <div>
            <label className="block text-sm font-medium mb-2 text-harbour-700">Cover Image</label>
            {coverImagePreview ? (
              <div className="relative">
                <img
                  src={coverImagePreview}
                  alt="Cover preview"
                  className="w-full aspect-video object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCoverImagePreview(null);
                    setCoverImageData(null);
                  }}
                  className="absolute top-2 right-2 p-1 bg-red-600 text-white"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full aspect-video border-2 border-dashed border-harbour-300 cursor-pointer hover:bg-harbour-50 transition-colors">
                <svg className="w-8 h-8 text-harbour-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="mt-2 text-sm text-harbour-400">Upload cover (16:9)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, "cover")}
                />
              </label>
            )}
          </div>

          {/* Icon Image */}
          <div>
            <label className="block text-sm font-medium mb-2 text-harbour-700">Icon Image</label>
            {iconImagePreview ? (
              <div className="relative w-32">
                <img
                  src={iconImagePreview}
                  alt="Icon preview"
                  className="w-32 h-32 object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIconImagePreview(null);
                    setIconImageData(null);
                  }}
                  className="absolute top-2 right-2 p-1 bg-red-600 text-white"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-harbour-300 cursor-pointer hover:bg-harbour-50 transition-colors">
                <svg className="w-8 h-8 text-harbour-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="mt-1 text-xs text-harbour-400">Icon (1:1)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, "icon")}
                />
              </label>
            )}
          </div>
        </div>

        {/* Hidden inputs for image data */}
        {coverImageData && (
          <input type="hidden" name="coverImageData" value={coverImageData} />
        )}
        {iconImageData && (
          <input type="hidden" name="iconImageData" value={iconImageData} />
        )}
        {event?.coverImage && !coverImageData && coverImagePreview && (
          <input type="hidden" name="existingCoverImage" value={event.coverImage} />
        )}
        {event?.iconImage && !iconImageData && iconImagePreview && (
          <input type="hidden" name="existingIconImage" value={event.iconImage} />
        )}

        {/* Dates */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-harbour-700">Event Dates *</label>
            <button
              type="button"
              onClick={addDate}
              className="text-sm text-harbour-600 hover:text-harbour-700"
            >
              + Add Date
            </button>
          </div>

          <div className="space-y-4">
            {dates.map((dateEntry, index) => (
              <div
                key={dateEntry.id}
                className="p-4 border border-harbour-200 bg-harbour-50/30"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-sm font-medium text-harbour-500">
                    Date {index + 1}
                  </span>
                  {dates.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDate(dateEntry.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-harbour-500 mb-1">
                      Start Date
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveDatePicker(
                          activeDatePicker === `${dateEntry.id}-start`
                            ? null
                            : `${dateEntry.id}-start`
                        )
                      }
                      className="w-full px-3 py-2 text-left border border-harbour-200 bg-white"
                    >
                      {format(dateEntry.startDate, "MMM d, yyyy")}
                    </button>
                    {activeDatePicker === `${dateEntry.id}-start` && (
                      <div className="absolute z-10 mt-1 bg-white border border-harbour-200 shadow-lg">
                        <DayPicker
                          mode="single"
                          selected={dateEntry.startDate}
                          onSelect={(date) => {
                            if (date) {
                              updateDate(dateEntry.id, { startDate: date });
                              setActiveDatePicker(null);
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-harbour-500 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={dateEntry.startTime}
                      onChange={(e) =>
                        updateDate(dateEntry.id, { startTime: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-harbour-200 bg-white"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="flex items-center gap-2 text-sm text-harbour-600">
                    <input
                      type="checkbox"
                      checked={dateEntry.isRange}
                      onChange={(e) =>
                        updateDate(dateEntry.id, {
                          isRange: e.target.checked,
                          endDate: e.target.checked ? dateEntry.startDate : null,
                        })
                      }
                      className="accent-harbour-600"
                    />
                    Has end time
                  </label>
                </div>

                {dateEntry.isRange && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    <div>
                      <label className="block text-xs text-harbour-500 mb-1">
                        End Date
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveDatePicker(
                            activeDatePicker === `${dateEntry.id}-end`
                              ? null
                              : `${dateEntry.id}-end`
                          )
                        }
                        className="w-full px-3 py-2 text-left border border-harbour-200 bg-white"
                      >
                        {dateEntry.endDate
                          ? format(dateEntry.endDate, "MMM d, yyyy")
                          : "Select date"}
                      </button>
                      {activeDatePicker === `${dateEntry.id}-end` && (
                        <div className="absolute z-10 mt-1 bg-white border border-harbour-200 shadow-lg">
                          <DayPicker
                            mode="single"
                            selected={dateEntry.endDate || undefined}
                            onSelect={(date) => {
                              if (date) {
                                updateDate(dateEntry.id, { endDate: date });
                                setActiveDatePicker(null);
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs text-harbour-500 mb-1">
                        End Time
                      </label>
                      <input
                        type="time"
                        value={dateEntry.endTime}
                        onChange={(e) =>
                          updateDate(dateEntry.id, { endTime: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-harbour-200 bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* Hidden inputs for this date */}
                <input
                  type="hidden"
                  name={`dates[${index}][startDate]`}
                  value={dateEntry.startDate.toISOString().split("T")[0]}
                />
                <input
                  type="hidden"
                  name={`dates[${index}][startTime]`}
                  value={dateEntry.startTime}
                />
                <input
                  type="hidden"
                  name={`dates[${index}][hasEnd]`}
                  value={dateEntry.isRange ? "1" : "0"}
                />
                {dateEntry.isRange && dateEntry.endDate && (
                  <>
                    <input
                      type="hidden"
                      name={`dates[${index}][endDate]`}
                      value={dateEntry.endDate.toISOString().split("T")[0]}
                    />
                    <input
                      type="hidden"
                      name={`dates[${index}][endTime]`}
                      value={dateEntry.endTime}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            className="px-6 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
          >
            {event ? "Update Event" : "Create Event"}
          </button>
        </div>
      </Form>

      {/* Cropper Modal */}
      {cropperState && (
        <ImageCropper
          imageSrc={cropperState.src}
          aspect={cropperState.type === "cover" ? 16 / 9 : 1}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropperState(null)}
        />
      )}
    </>
  );
}
