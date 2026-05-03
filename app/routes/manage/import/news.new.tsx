import type { Route } from "./+types/news.new";
import { Form, Link, useActionData, useNavigation, redirect } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/session.server";
import { createNewsImportSource } from "~/lib/news-importers/sync.server";
import { newsSourceTypes, sourceTypeLabels } from "~/lib/news-importers/types";
import type { NewsSourceType } from "~/lib/news-importers/types";
import { ManagePage } from "~/components/manage/ManagePage";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Add News Import Source - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return null;
}

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  sourceType: z.enum(newsSourceTypes),
  sourceUrl: z.string().trim().min(1, "Source URL is required").url("Must be a valid URL"),
  sourceIdentifier: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z.string().nullable(),
  ),
  keywords: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z.string().nullable(),
  ),
  enabled: z.preprocess((v) => v === "on", z.boolean()),
});

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const values: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    values[key] = value;
  }
  // Checkbox won't be present if unchecked
  if (!formData.has("enabled")) {
    values.enabled = "" as FormDataEntryValue;
  }

  const parsed = formSchema.safeParse(values);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { error: firstIssue?.message ?? "Invalid form data" };
  }

  try {
    await createNewsImportSource({
      name: parsed.data.name,
      sourceType: parsed.data.sourceType as NewsSourceType,
      sourceUrl: parsed.data.sourceUrl,
      sourceIdentifier: parsed.data.sourceIdentifier,
      keywords: parsed.data.keywords,
      enabled: parsed.data.enabled,
    });

    return redirect("/manage/import/news");
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export default function NewNewsImportSource() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <ManagePage
      title="Add News Import Source"
      backTo="/manage/import/news"
      backLabel="Back to Import News"
    >
      {actionData?.error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700">{actionData.error}</div>
      )}

      <Form method="post" className="bg-white border border-harbour-200 p-6 flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-harbour-700 mb-1">
            Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            placeholder="e.g. Halifax Tech News RSS"
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:border-harbour-500"
          />
        </div>

        <div>
          <label htmlFor="sourceType" className="block text-sm font-medium text-harbour-700 mb-1">
            Source Type *
          </label>
          <select
            id="sourceType"
            name="sourceType"
            required
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:border-harbour-500"
          >
            {newsSourceTypes.map((type) => (
              <option key={type} value={type}>
                {sourceTypeLabels[type]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="sourceUrl" className="block text-sm font-medium text-harbour-700 mb-1">
            Source URL *
          </label>
          <input
            type="url"
            id="sourceUrl"
            name="sourceUrl"
            required
            placeholder="https://example.com/feed.xml"
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:border-harbour-500"
          />
          <p className="mt-1 text-xs text-harbour-400">
            RSS feed URL or page URL for custom scrapers.
          </p>
        </div>

        <div>
          <label
            htmlFor="sourceIdentifier"
            className="block text-sm font-medium text-harbour-700 mb-1"
          >
            Source Identifier (optional)
          </label>
          <input
            type="text"
            id="sourceIdentifier"
            name="sourceIdentifier"
            placeholder="scraperName or scraperName:config"
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:border-harbour-500"
          />
          <p className="mt-1 text-xs text-harbour-400">
            For custom scrapers: the scraper name or scraper name with config.
          </p>
        </div>

        <div>
          <label htmlFor="keywords" className="block text-sm font-medium text-harbour-700 mb-1">
            Keywords (optional)
          </label>
          <input
            type="text"
            id="keywords"
            name="keywords"
            placeholder="halifax, nova scotia, atlantic canada"
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:border-harbour-500"
          />
          <p className="mt-1 text-xs text-harbour-400">
            Comma-separated keywords for filtering. Leave empty to import all items.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="enabled"
            name="enabled"
            defaultChecked
            className="w-4 h-4"
          />
          <label htmlFor="enabled" className="text-sm text-harbour-700">
            Enabled (include in sync operations)
          </label>
        </div>

        <div className="flex items-center gap-3 pt-4 border-t border-harbour-100">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {isSubmitting ? "Creating..." : "Add Source"}
          </button>
          <Link
            to="/manage/import/news"
            className="px-4 py-2 text-harbour-500 hover:text-harbour-700"
          >
            Cancel
          </Link>
        </div>
      </Form>
    </ManagePage>
  );
}
