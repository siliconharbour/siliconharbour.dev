import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { createNews } from "~/lib/news.server";
import { processAndSaveCoverImage } from "~/lib/images.server";

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

  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const excerpt = (formData.get("excerpt") as string) || null;
  const publishNow = formData.get("publishNow") === "1";

  if (!title || !content) {
    return { error: "Title and content are required" };
  }

  let coverImage: string | null = null;
  const coverImageData = formData.get("coverImageData") as string | null;

  if (coverImageData) {
    const base64Data = coverImageData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    coverImage = await processAndSaveCoverImage(buffer);
  }

  await createNews({
    title,
    content,
    excerpt,
    coverImage,
    publishedAt: publishNow ? new Date() : null,
  });

  return redirect("/manage/news");
}

export default function NewNews() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to="/manage/news"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to News
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">New Article</h1>

        {actionData?.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">
            {actionData.error}
          </div>
        )}

        <Form method="post" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="title" className="font-medium text-harbour-700">
              Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              required
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="excerpt" className="font-medium text-harbour-700">
              Excerpt (for RSS/previews)
            </label>
            <textarea
              id="excerpt"
              name="excerpt"
              rows={2}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="content" className="font-medium text-harbour-700">
              Content * (Markdown)
            </label>
            <textarea
              id="content"
              name="content"
              required
              rows={12}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

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

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Create Article
          </button>
        </Form>
      </div>
    </div>
  );
}
