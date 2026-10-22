import { newsFormInput } from "~/lib/admin/content-form-adapters";
import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";
import { useState } from "react";

import { requireAdmin } from "~/lib/session.server";

import { ImageUpload } from "~/components/ImageUpload";
import { newsTypes, type NewsType } from "~/db/schema";
import { actionError } from "~/lib/admin/action-result";

import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

const typeLabels: Record<NewsType, string> = {
  link: "Link Post",
  article: "Article",
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Article - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const result = await runAdminOperation(request, operationCatalog.newsArticleCreate, {
    ...newsFormInput(form, false),
  });
  if (!result.ok) return actionError(result.error);
  return redirect("/manage/news");
}

export default function NewNews() {
  const actionData = useActionData<typeof action>();
  const [selectedType, setSelectedType] = useState<NewsType>("article");

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/news" className="text-sm text-subtle hover:text-body">
            &larr; Back to News
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">New Article</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-gap-6">
          <ManageField label="Type" htmlFor="type">
            <select
              id="type"
              name="type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as NewsType)}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField
            label={
              selectedType === "link" ? "Commentary (optional, Markdown)" : "Content * (Markdown)"
            }
            htmlFor="content"
          >
            <textarea
              id="content"
              name="content"
              required={selectedType === "article"}
              rows={selectedType === "article" ? 12 : 4}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <ManageField label="Status" htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue="draft"
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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
