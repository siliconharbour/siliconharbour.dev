import type { Route } from "./+types/events.new";
import { useState } from "react";
import { Link, redirect, useActionData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  createEventImportSource,
  validateEventImportSourceConfig,
} from "~/lib/event-importers/sync.server";
import { sourceTypeLabels } from "~/lib/event-importers/types";
import { EntityPicker } from "~/components/EntityPicker";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Add Event Import Source - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();

  const name = (formData.get("name") as string)?.trim();
  const sourceType = formData.get("sourceType") as string;
  const sourceIdentifier = (formData.get("sourceIdentifier") as string)?.trim();
  const sourceUrl = (formData.get("sourceUrl") as string)?.trim();
  const organizer = (formData.get("organizer") as string)?.trim() || null;

  if (!name || !sourceType || !sourceIdentifier || !sourceUrl) {
    return { error: "All fields are required." };
  }

  try {
    const validation = await validateEventImportSourceConfig({
      organizer,
      sourceType,
      sourceIdentifier,
      sourceUrl,
    });
    if (!validation.valid) {
      return { error: validation.error ?? "Source validation failed." };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error during validation." };
  }

  const source = await createEventImportSource({
    name,
    organizer,
    sourceType,
    sourceIdentifier,
    sourceUrl,
  });

  return redirect(`/manage/import/events/${source.id}`);
}

const SOURCE_TYPES = ["luma-user", "technl", "netbenefit"] as const;

const FIXED_SOURCES: Partial<Record<string, { identifier: string; url: string }>> = {
  technl: { identifier: "technl", url: "https://technl.ca/news-events/" },
  netbenefit: { identifier: "netbenefit", url: "https://www.netbenefitsoftware.com/events" },
};

export default function NewEventImportSource() {
  const actionData = useActionData<typeof action>();
  const [selectedType, setSelectedType] = useState<string>("");

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to="/manage/import/events"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Event Import Sources
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Add Event Import Source</h1>

        {actionData?.error && (
          <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {actionData.error}
          </div>
        )}

        <form method="post" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-harbour-600" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="e.g. TechNest Community (Luma)"
              className="border border-harbour-200 px-3 py-2 text-sm text-harbour-700 focus:outline-none focus:border-harbour-400"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-harbour-600" htmlFor="sourceType">
              Source Type
            </label>
            <select
              id="sourceType"
              name="sourceType"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="border border-harbour-200 px-3 py-2 text-sm text-harbour-700 focus:outline-none focus:border-harbour-400"
              required
            >
              <option value="">Select a source type…</option>
              {SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {sourceTypeLabels[type] ?? type}
                </option>
              ))}
            </select>
          </div>

          {!FIXED_SOURCES[selectedType] && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-harbour-600" htmlFor="sourceIdentifier">
                Source Identifier
              </label>
              <input
                id="sourceIdentifier"
                name="sourceIdentifier"
                type="text"
                placeholder="e.g. usr-bSGJmqMm6oO62Ze or EthanDenny"
                className="border border-harbour-200 px-3 py-2 text-sm text-harbour-700 focus:outline-none focus:border-harbour-400"
                required
              />
              <p className="text-xs text-harbour-400">
                The user ID (e.g. usr-xxxx) or username from the Luma profile URL.
              </p>
            </div>
          )}

          {FIXED_SOURCES[selectedType] && (
            <>
              <input type="hidden" name="sourceIdentifier" value={FIXED_SOURCES[selectedType]!.identifier} />
              <input type="hidden" name="sourceUrl" value={FIXED_SOURCES[selectedType]!.url} />
            </>
          )}

          {!FIXED_SOURCES[selectedType] && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-harbour-600" htmlFor="sourceUrl">
                Source URL
              </label>
              <input
                id="sourceUrl"
                name="sourceUrl"
                type="url"
                placeholder="https://luma.com/user/usr-xxxx"
                className="border border-harbour-200 px-3 py-2 text-sm text-harbour-700 focus:outline-none focus:border-harbour-400"
                required
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <EntityPicker
              name="organizer"
              label="Organizer (optional)"
              placeholder="Search companies, groups, people..."
            />
            <p className="text-xs text-harbour-400">
              Pre-populates the organizer field on imported events.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-harbour-600 text-white hover:bg-harbour-700 text-sm"
            >
              Validate &amp; Save
            </button>
            <Link
              to="/manage/import/events"
              className="px-4 py-2 border border-harbour-200 text-harbour-600 hover:bg-harbour-50 text-sm"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
