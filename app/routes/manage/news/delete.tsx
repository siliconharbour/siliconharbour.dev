import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getNewsById, deleteNews } from "~/lib/news.server";
import { parseIdOrThrow } from "~/lib/admin/route";
import { DeleteConfirmationCard } from "~/components/manage/DeleteConfirmationCard";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.article?.title || "Article"} - siliconharbour.dev` }];
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

  const id = parseIdOrThrow(params.id, "article");

  await deleteNews(id);
  return redirect("/manage/news");
}

export default function DeleteNews() {
  const { article } = useLoaderData<typeof loader>();

  const typeLabel = article.type === "link" ? "link post" : "article";

  return (
    <DeleteConfirmationCard
      title={`Delete ${article.type === "link" ? "Link Post" : "Article"}`}
      message={
        <>
          Are you sure you want to delete the {typeLabel}{" "}
          <strong>{article.title}</strong>? This action cannot be undone.
        </>
      }
    >
      <Form method="post" className="flex gap-gap-4">
        <button
          type="submit"
          className="px-pad-4 py-pad-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
        >
          Delete
        </button>
        <Link
          to="/manage/news"
          className="px-pad-4 py-pad-2 text-body hover:bg-soft font-medium transition-colors"
        >
          Cancel
        </Link>
      </Form>
    </DeleteConfirmationCard>
  );
}
