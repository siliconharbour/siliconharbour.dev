import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";
import { useState } from "react";
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
  link: "Link Post",
  article: "Article",
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
  const itemType = (formData.get("type") as string) || "article";

  const baseSchema = {
    title: zRequiredString("Title"),
    type: z.enum(newsTypes),
    excerpt: zOptionalNullableString,
    status: z.enum(["draft", "published"]).default("draft"),
  };

  const schema =
    itemType === "link"
      ? z.object({
          ...baseSchema,
          externalUrl: zRequiredString("URL"),
          sourceName: zOptionalNullableString,
          content: zOptionalNullableString,
        })
      : z.object({
          ...baseSchema,
          content: zRequiredString("Content"),
          externalUrl: zOptionalNullableString,
          sourceName: zOptionalNullableString,
        });

  const parsed = parseFormData(formData, schema);
  if (!parsed.success) {
    return actionError(parsed.error);
  }

  const coverImage =
    itemType === "article"
      ? await createImageFromFormData(formData, "coverImageData", processAndSaveCoverImage)
      : undefined;

  await createNews({
    title: parsed.data.title,
    content: parsed.data.content || "",
    excerpt: parsed.data.excerpt,
    type: parsed.data.type as NewsType,
    externalUrl: parsed.data.externalUrl,
    sourceName: parsed.data.sourceName,
    status: parsed.data.status,
    coverImage,
    publishedAt: parsed.data.status === "published" ? new Date() : null,
  });

  return redirect("/manage/news");
}

export default function NewNews() {
  const actionData = useActionData<typeof action>();
  const [selectedType, setSelectedType] = useState<NewsType>("article");

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/news" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to News
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">New Article</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-6">
          <ManageField label="Type" htmlFor="type">
            <select
              id="type"
              name="type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as NewsType)}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
              {newsTypes.map((t) => (
                <option key={t} value={t}>
                  {typeLabels[t]}
                </option>
              ))}
            </select>
          </ManageField>

          {selectedType === "article" && (
            <ImageUpload
              label="Cover Image"
              name="coverImageData"
              aspect={16 / 9}
              previewStyle="cover"
              helpText="Upload cover (16:9)"
            />
          )}

          <ManageField label="Title *" htmlFor="title">
            <input
              type="text"
              id="title"
              name="title"
              required
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          {selectedType === "link" && (
            <>
              <ManageField label="URL *" htmlFor="externalUrl">
                <input
                  type="url"
                  id="externalUrl"
                  name="externalUrl"
                  required
                  placeholder="https://example.com/article"
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                />
              </ManageField>

              <ManageField
                label="Source Name"
                htmlFor="sourceName"
                hint="e.g. CBC News, TechCrunch. Leave empty to auto-detect from domain."
              >
                <input
                  type="text"
                  id="sourceName"
                  name="sourceName"
                  placeholder="example.com"
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                />
              </ManageField>
            </>
          )}

          <ManageField label="Excerpt (for RSS/previews)" htmlFor="excerpt">
            <textarea
              id="excerpt"
              name="excerpt"
              rows={2}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField
            label={
              selectedType === "link"
                ? "Commentary (optional, Markdown)"
                : "Content * (Markdown)"
            }
            htmlFor="content"
          >
            <textarea
              id="content"
              name="content"
              required={selectedType === "article"}
              rows={selectedType === "article" ? 12 : 4}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <ManageField label="Status" htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue="draft"
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </ManageField>

          <ManageSubmitButton>
            {selectedType === "link" ? "Create Link Post" : "Create Article"}
          </ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
