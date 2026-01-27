import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getNewsById, updateNews } from "~/lib/news.server";
import { processAndSaveCoverImage, deleteImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { newsTypes, type NewsType } from "~/db/schema";

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

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid ID", { status: 400 });
  }

  const article = await getNewsById(id);
  if (!article) {
    throw new Response("Article not found", { status: 404 });
  }

  return { article };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return { error: "Invalid ID" };
  }

  const existing = await getNewsById(id);
  if (!existing) {
    return { error: "Article not found" };
  }

  const formData = await request.formData();

  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const excerpt = (formData.get("excerpt") as string) || null;
  const type = (formData.get("type") as NewsType) || "announcement";
  const publishNow = formData.get("publishNow") === "1";

  if (!title || !content) {
    return { error: "Title and content are required" };
  }

  let coverImage: string | null | undefined = undefined;
  const coverImageData = formData.get("coverImageData") as string | null;
  const existingCoverImage = formData.get("existingCoverImage") as string | null;

  if (coverImageData) {
    if (existing.coverImage) await deleteImage(existing.coverImage);
    const base64Data = coverImageData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    coverImage = await processAndSaveCoverImage(buffer);
  } else if (existingCoverImage) {
    coverImage = existingCoverImage;
  } else if (existing.coverImage) {
    await deleteImage(existing.coverImage);
    coverImage = null;
  }

  // Handle publish state
  let publishedAt: Date | null | undefined = undefined;
  if (publishNow && !existing.publishedAt) {
    publishedAt = new Date();
  } else if (!publishNow) {
    publishedAt = null;
  }

  await updateNews(id, {
    title,
    content,
    excerpt,
    type,
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

        {actionData?.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">{actionData.error}</div>
        )}

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

          <div className="flex flex-col gap-2">
            <label htmlFor="title" className="font-medium text-harbour-700">
              Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              required
              defaultValue={article.title}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="type" className="font-medium text-harbour-700">
              Type
            </label>
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
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="excerpt" className="font-medium text-harbour-700">
              Excerpt (for RSS/previews)
            </label>
            <textarea
              id="excerpt"
              name="excerpt"
              rows={2}
              defaultValue={article.excerpt ?? ""}
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
              defaultValue={article.content}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

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

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Update Article
          </button>
        </Form>
      </div>
    </div>
  );
}
