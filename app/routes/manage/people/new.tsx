import { socialLinkKeys, socialLinkLabels } from "~/lib/links";
import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";
import { directoryFormInput } from "~/lib/admin/form-adapters";
import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { ImageUpload } from "~/components/ImageUpload";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Person - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();

  const result = await runAdminOperation(request, operationCatalog.personCreate, {
    ...directoryFormInput("person", form, false),
  });
  if (!result.ok) return { error: result.error };
  return redirect("/manage/people");
}

export default function NewPerson() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/people" className="text-sm text-subtle hover:text-body">
            &larr; Back to People
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">New Person</h1>

        {actionData?.error && (
          <div className="p-pad-4 bg-red-50 border border-red-200 text-red-600">
            {actionData.error}
          </div>
        )}

        <Form method="post" className="flex flex-col gap-gap-6">
          <ImageUpload
            label="Avatar"
            name="avatarData"
            aspect={1}
            previewStyle="square"
            helpText="Upload avatar (1:1)"
          />

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="name" className="font-medium text-heading">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="bio" className="font-medium text-heading">
              Bio (Markdown)
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={8}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="website" className="font-medium text-heading">
              Website
            </label>
            <input
              type="url"
              id="website"
              name="website"
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-4">
            <h3 className="font-medium text-heading">Social Links</h3>

            <div className="flex flex-col gap-gap-2">
              <label htmlFor="github" className="text-sm text-body">
                GitHub
              </label>
              <input
                type="url"
                id="github"
                name="github"
                placeholder="https://github.com/username"
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            {socialLinkKeys.map((key) => (
              <div key={key} className="flex flex-col gap-gap-2">
                <label htmlFor={key} className="text-sm text-body">
                  {socialLinkLabels[key]}
                </label>
                <input
                  type="url"
                  id={key}
                  name={key}
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                />
              </div>
            ))}
          </div>

          <button
            type="submit"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors self-start"
          >
            Create Person
          </button>
        </Form>
      </div>
    </div>
  );
}
