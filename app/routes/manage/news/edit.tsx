import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/session.server";
import { getNewsById, updateNews } from "~/lib/news.server";
import { processAndSaveCoverImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { newsTypes, type NewsType } from "~/db/schema";
import { parseIdOrError, parseIdOrThrow } from "~/lib/admin/route";
import { parseFormData, zOptionalNullableString, zRequiredString } from "~/lib/admin/form";
import { actionError } from "~/lib/admin/action-result";
import { resolveUpdatedImage } from "~/lib/admin/image-fields";
import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

const typeLabels: Record<NewsType, string> = {
  announcement: "Announcement",
  general: "General",
  editorial: "Editorial",
  meta: "Site Update",
};

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.article?.title || "Article"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "article");

  const article = await getNewsById(id);
  if (!article) {
    throw new Response("Article not found", { status: 404 });
  }

  return { article };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const parsedId = parseIdOrError(params.id, "article");
  if ("error" in parsedId) return parsedId;
  const id = parsedId.id;

  const existing = await getNewsById(id);
  if (!existing) {
    return actionError("Article not found");
  }

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

  const coverImage = await resolveUpdatedImage({
    formData,
    uploadedImageField: "coverImageData",
    existingImageField: "existingCoverImage",
    currentImage: existing.coverImage,
    processor: processAndSaveCoverImage,
  });

  // Handle publish state
  let publishedAt: Date | null | undefined = undefined;
  if (parsed.data.publishNow && !existing.publishedAt) {
    publishedAt = new Date();
  } else if (!parsed.data.publishNow) {
    publishedAt = null;
  }

  await updateNews(id, {
    title: parsed.data.title,
    content: parsed.data.content,
    excerpt: parsed.data.excerpt,
    type: parsed.data.type as NewsType,
    ...(coverImage !== undefined && { coverImage }),
    ...(publishedAt !== undefined && { publishedAt }),
  });

  return redirect("/manage/news");
}

export default function EditNews() {
  const { article } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/news" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to News
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Edit Article</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-6">
          <ImageUpload
            label="Cover Image"
            name="coverImageData"
            existingName="existingCoverImage"
            aspect={16 / 9}
            existingImage={article.coverImage}
            previewStyle="cover"
            helpText="Upload cover (16:9)"
          />

          <ManageField label="Title *" htmlFor="title">
            <input
              type="text"
              id="title"
              name="title"
              required
              defaultValue={article.title}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Type" htmlFor="type">
            <select
              id="type"
              name="type"
              defaultValue={article.type}
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
              defaultValue={article.excerpt ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Content * (Markdown)" htmlFor="content">
            <textarea
              id="content"
              name="content"
              required
              rows={12}
              defaultValue={article.content}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="publishNow"
              name="publishNow"
              value="1"
              defaultChecked={!!article.publishedAt}
              className="w-4 h-4"
            />
            <label htmlFor="publishNow" className="text-harbour-700">
              {article.publishedAt ? "Published" : "Publish now"}
            </label>
          </div>

          <ManageSubmitButton>Update Article</ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
