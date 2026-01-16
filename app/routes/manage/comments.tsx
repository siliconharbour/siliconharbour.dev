import type { Route } from "./+types/comments";
import { Link, useLoaderData, useSearchParams, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getPaginatedComments } from "~/lib/comments.server";
import { formatDistanceToNow } from "date-fns";
import type { Comment, ContentType } from "~/db/schema";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Comments - Manage - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const perPage = 20;
  
  const { comments, total, totalPages } = await getPaginatedComments(page, perPage);
  
  return { comments, total, totalPages, currentPage: page };
}

function getContentUrl(contentType: ContentType, contentId: number): string {
  const typeToPath: Record<ContentType, string> = {
    event: "events",
    company: "companies",
    group: "groups",
    learning: "learning",
    person: "people",
    news: "news",
    job: "jobs",
    project: "projects",
  };
  // We don't have slug here, so link to admin edit page instead
  return `/manage/${typeToPath[contentType]}/${contentId}`;
}

function getContentLabel(contentType: ContentType): string {
  const labels: Record<ContentType, string> = {
    event: "Event",
    company: "Company",
    group: "Group",
    learning: "Learning",
    person: "Person",
    news: "News",
    job: "Job",
    project: "Project",
  };
  return labels[contentType];
}

export default function ManageComments() {
  const { comments, total, totalPages, currentPage } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-harbour-700">Comments</h1>
            <p className="text-harbour-400 text-sm">{total} total comments</p>
          </div>
          <Link
            to="/manage"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            Back to Dashboard
          </Link>
        </div>

        {comments.length === 0 ? (
          <p className="text-harbour-400">No comments yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {comments.map((comment) => (
              <CommentRow key={comment.id} comment={comment} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            {currentPage > 1 && (
              <Link
                to={`?page=${currentPage - 1}`}
                className="px-3 py-1.5 text-sm text-harbour-600 hover:text-harbour-700 border border-harbour-200 hover:border-harbour-300"
              >
                Previous
              </Link>
            )}
            
            <span className="text-sm text-harbour-500 px-3">
              Page {currentPage} of {totalPages}
            </span>
            
            {currentPage < totalPages && (
              <Link
                to={`?page=${currentPage + 1}`}
                className="px-3 py-1.5 text-sm text-harbour-600 hover:text-harbour-700 border border-harbour-200 hover:border-harbour-300"
              >
                Next
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentRow({ comment }: { comment: Comment }) {
  const fetcher = useFetcher();
  const isDeleting = fetcher.state !== "idle";

  return (
    <div
      className={`p-4 border ${
        comment.isPrivate
          ? "bg-amber-50 border-amber-200"
          : "bg-white border-harbour-200"
      } ${isDeleting ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="font-medium text-harbour-700">
              {comment.authorName || "Anonymous"}
            </span>
            <span className="text-xs text-harbour-400">
              {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
            </span>
            {comment.isPrivate && (
              <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700">
                Private Feedback
              </span>
            )}
            <Link
              to={getContentUrl(comment.contentType, comment.contentId)}
              className="text-xs text-harbour-500 hover:text-harbour-600 underline"
            >
              {getContentLabel(comment.contentType)} #{comment.contentId}
            </Link>
          </div>
          
          <p className="text-harbour-600 text-sm whitespace-pre-wrap mb-2">
            {comment.content}
          </p>
          
          {/* Metadata for spam management */}
          <div className="flex items-center gap-4 text-xs text-harbour-400">
            {comment.ipAddress && (
              <span title="IP Address">IP: {comment.ipAddress}</span>
            )}
            {comment.userAgent && (
              <span 
                title={comment.userAgent}
                className="truncate max-w-xs"
              >
                UA: {comment.userAgent.slice(0, 50)}...
              </span>
            )}
          </div>
        </div>
        
        <fetcher.Form method="post" action="/api/comments/delete">
          <input type="hidden" name="commentId" value={comment.id} />
          <button
            type="submit"
            disabled={isDeleting}
            className="px-3 py-1.5 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 disabled:opacity-50"
          >
            Delete
          </button>
        </fetcher.Form>
      </div>
    </div>
  );
}
