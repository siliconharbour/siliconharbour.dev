import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/session.server";
import { createNews } from "~/lib/news.server";
import { processAndSaveCoverImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { newsTypes, type NewsType } from "~/db/schema";
import { actionError } from "~/lib/admin/action-result";
import { parseFormData, zOptionalNullableString, zRequiredString } from "~/lib/admin/form";
import { createImageFromFormData } from "~/lib/admin/image-fields";
import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

const typeLabels: Record<NewsType, string> = {
  announcement: "Announcement",
  general: "General",
  editorial: "Editorial",
  meta: "Site Update",
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Article - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const schema = z.object({
    title: zRequiredString("Title"),
    content: zRequiredString("Content"),
    excerpt: zOptionalNullableString,
    type: z.enum(newsTypes),
    publishNow: z.preprocess((value) => value === "1", z.boolean()),
  });
  const parsed = parseFormData(formData, schema);
  if (!parsed.success) {
    return actionError(parsed.error);
  }

  const coverImage = await createImageFromFormData(formData, "coverImageData", processAndSaveCoverImage);

  await createNews({
    title: parsed.data.title,
    content: parsed.data.content,
    excerpt: parsed.data.excerpt,
    type: parsed.data.type as NewsType,
    coverImage,
    publishedAt: parsed.data.publishNow ? new Date() : null,
  });

  return redirect("/manage/news");
}

export default function NewNews() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/news" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to News
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">New Article</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-6">
          <ImageUpload
            label="Cover Image"
            name="coverImageData"
            aspect={16 / 9}
            previewStyle="cover"
            helpText="Upload cover (16:9)"
          />

          <ManageField label="Title *" htmlFor="title">
            <input
              type="text"
              id="title"
              name="title"
              required
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Type" htmlFor="type">
            <select
              id="type"
              name="type"
              defaultValue="announcement"
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
              {newsTypes.map((t) => (
                <option key={t} value={t}>
                  {typeLabels[t]}
                </option>
                ))}
              </select>
          </ManageField>

          <ManageField label="Excerpt (for RSS/previews)" htmlFor="excerpt">
            <textarea
              id="excerpt"
              name="excerpt"
              rows={2}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Content * (Markdown)" htmlFor="content">
            <textarea
              id="content"
              name="content"
              required
              rows={12}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="publishNow"
              name="publishNow"
              value="1"
              className="w-4 h-4"
            />
            <label htmlFor="publishNow" className="text-harbour-700">
              Publish immediately
            </label>
          </div>

          <ManageSubmitButton>Create Article</ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
