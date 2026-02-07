import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getNewsById, deleteNews } from "~/lib/news.server";
import { parseIdOrThrow } from "~/lib/admin/route";
import { DeleteConfirmationCard } from "~/components/manage/DeleteConfirmationCard";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.article?.title || "Article"} - siliconharbour.dev` }];
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

  const id = parseIdOrThrow(params.id, "article");

  await deleteNews(id);
  return redirect("/manage/news");
}

export default function DeleteNews() {
  const { article } = useLoaderData<typeof loader>();

  return (
    <DeleteConfirmationCard
      title="Delete Article"
      message={
        <>
          Are you sure you want to delete <strong>{article.title}</strong>? This action cannot be
          undone.
        </>
      }
    >
      <Form method="post" className="flex gap-4">
        <button
          type="submit"
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
        >
          Delete
        </button>
        <Link
          to="/manage/news"
          className="px-4 py-2 text-harbour-600 hover:bg-harbour-50 font-medium transition-colors"
        >
          Cancel
        </Link>
      </Form>
    </DeleteConfirmationCard>
  );
}
