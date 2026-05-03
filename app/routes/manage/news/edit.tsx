import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/session.server";
import { getNewsById, updateNews } from "~/lib/news.server";
import { processAndSaveCoverImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import type { NewsType, NewsStatus } from "~/db/schema";
import { parseIdOrError, parseIdOrThrow } from "~/lib/admin/route";
import { parseFormData, zOptionalNullableString, zRequiredString } from "~/lib/admin/form";
import { actionError } from "~/lib/admin/action-result";
import { resolveUpdatedImage } from "~/lib/admin/image-fields";
import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

const typeLabels: Record<NewsType, string> = {
  link: "Link Post",
  article: "Article",
};

const statusOptions: { value: NewsStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
];

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
  const isLink = existing.type === "link";

  const schema = isLink
    ? z.object({
        title: zRequiredString("Title"),
        content: zOptionalNullableString,
        excerpt: zOptionalNullableString,
        externalUrl: zRequiredString("URL"),
        sourceName: zOptionalNullableString,
        status: z.enum(["draft", "published", "hidden"]),
      })
    : z.object({
        title: zRequiredString("Title"),
        content: zRequiredString("Content"),
        excerpt: zOptionalNullableString,
        status: z.enum(["draft", "published", "hidden"]),
      });

  const parsed = parseFormData(formData, schema);
  if (!parsed.success) {
    return actionError(parsed.error);
  }

  const coverImage =
    existing.type === "article"
      ? await resolveUpdatedImage({
          formData,
          uploadedImageField: "coverImageData",
          existingImageField: "existingCoverImage",
          currentImage: existing.coverImage,
          processor: processAndSaveCoverImage,
        })
      : undefined;

  // Handle publish state based on status change
  let publishedAt: Date | null | undefined = undefined;
  if (parsed.data.status === "published" && !existing.publishedAt) {
    publishedAt = new Date();
  } else if (parsed.data.status !== "published") {
    // Keep existing publishedAt if going to draft/hidden but was previously published
    // This preserves the original publish date
  }

  await updateNews(id, {
    title: parsed.data.title,
    content: parsed.data.content || "",
    excerpt: parsed.data.excerpt,
    status: parsed.data.status as NewsStatus,
    ...("externalUrl" in parsed.data && { externalUrl: parsed.data.externalUrl }),
    ...("sourceName" in parsed.data && { sourceName: parsed.data.sourceName }),
    ...(coverImage !== undefined && { coverImage }),
    ...(publishedAt !== undefined && { publishedAt }),
  });

  return redirect("/manage/news");
}

export default function EditNews() {
  const { article } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const isLink = article.type === "link";

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/news" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to News
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-harbour-700">Edit Article</h1>
          <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-600">
            {typeLabels[article.type as NewsType] || article.type}
          </span>
        </div>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-6">
          {!isLink && (
            <ImageUpload
              label="Cover Image"
              name="coverImageData"
              existingName="existingCoverImage"
              aspect={16 / 9}
              existingImage={article.coverImage}
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
              defaultValue={article.title}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          {isLink && (
            <>
              <ManageField label="URL *" htmlFor="externalUrl">
                <input
                  type="url"
                  id="externalUrl"
                  name="externalUrl"
                  required
                  defaultValue={article.externalUrl ?? ""}
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                />
              </ManageField>

              <ManageField label="Source Name" htmlFor="sourceName">
                <input
                  type="text"
                  id="sourceName"
                  name="sourceName"
                  defaultValue={article.sourceName ?? ""}
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
              defaultValue={article.excerpt ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField
            label={isLink ? "Commentary (optional, Markdown)" : "Content * (Markdown)"}
            htmlFor="content"
          >
            <textarea
              id="content"
              name="content"
              required={!isLink}
              rows={isLink ? 4 : 12}
              defaultValue={article.content}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <ManageField label="Status" htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue={article.status}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </ManageField>

          <ManageSubmitButton>
            {isLink ? "Update Link Post" : "Update Article"}
          </ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
