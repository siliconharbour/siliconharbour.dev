import { newsFormInput } from "~/lib/admin/content-form-adapters";
import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";

import { requireAdmin } from "~/lib/session.server";
import { getNewsById } from "~/lib/news.server";

import { ImageUpload } from "~/components/ImageUpload";
import type { NewsType, NewsStatus } from "~/db/schema";
import { parseIdOrThrow } from "~/lib/admin/route";

import { actionError } from "~/lib/admin/action-result";

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

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.article?.title || "Article"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseIdOrThrow(params.id, "article");

  const article = await getNewsById(id);
  if (!article) {
    throw new Response("Article not found", { status: 404 });
  }

  return { article };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const result = await runAdminOperation(request, operationCatalog.newsUpdate, {
    id: Number(params.id),
    ...newsFormInput(form, true),
  });
  if (!result.ok) return actionError(result.error);
  return redirect("/manage/news");
}

export default function EditNews() {
  const { article } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const isLink = article.type === "link";

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/news" className="text-sm text-subtle hover:text-body">
            &larr; Back to News
          </Link>
        </div>

        <div className="flex items-center gap-gap-3">
          <h1 className="text-2xl font-semibold text-heading">Edit Article</h1>
          <span className="text-xs px-pad-1-5 py-pad-0-5 bg-tint text-body">
            {typeLabels[article.type as NewsType] || article.type}
          </span>
        </div>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-gap-6">
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
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                />
              </ManageField>

              <ManageField label="Source Name" htmlFor="sourceName">
                <input
                  type="text"
                  id="sourceName"
                  name="sourceName"
                  defaultValue={article.sourceName ?? ""}
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <ManageField label="Status" htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue={article.status}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </ManageField>

          <ManageSubmitButton>{isLink ? "Update Link Post" : "Update Article"}</ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
