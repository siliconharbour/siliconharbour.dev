import { useFetcher } from "react-router";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import type { Comment, ContentType } from "~/db/schema";
import { TurnstileInput } from "./Turnstile";

interface CommentSectionProps {
  contentType: ContentType;
  contentId: number;
  comments: Comment[];
  turnstileSiteKey: string | null;
  isAdmin?: boolean;
}

export function CommentSection({
  contentType,
  contentId,
  comments,
  turnstileSiteKey,
  isAdmin = false,
}: CommentSectionProps) {
  const fetcher = useFetcher();
  const [showPrivateOption, setShowPrivateOption] = useState(false);
  const isSubmitting = fetcher.state !== "idle";

  // Reset form after successful submission
  useEffect(() => {
    if (fetcher.data?.success) {
      // The page will be revalidated automatically with React Router
      setShowPrivateOption(false);
    }
  }, [fetcher.data]);

  const publicComments = comments.filter((c) => !c.isPrivate);
  const privateComments = comments.filter((c) => c.isPrivate);

  return (
    <div className="flex flex-col gap-6">
      <div className="border-t border-harbour-200/50 pt-6">
        <h2 className="text-lg font-semibold text-harbour-700 mb-4">Comments</h2>

        {/* Comment Form */}
        <fetcher.Form
          method="post"
          action="/api/comments"
          className="flex flex-col gap-4 mb-8"
        >
          <input type="hidden" name="contentType" value={contentType} />
          <input type="hidden" name="contentId" value={contentId} />

          <div className="flex flex-col gap-2">
            <label htmlFor="authorName" className="text-sm font-medium text-harbour-600">
              Name <span className="text-harbour-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              id="authorName"
              name="authorName"
              placeholder="Anonymous"
              className="px-3 py-2 border border-harbour-200 focus:border-harbour-400 focus:outline-none text-harbour-700"
              disabled={isSubmitting}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="content" className="text-sm font-medium text-harbour-600">
              Comment
            </label>
            <textarea
              id="content"
              name="content"
              rows={4}
              required
              placeholder="Share your thoughts..."
              className="px-3 py-2 border border-harbour-200 focus:border-harbour-400 focus:outline-none text-harbour-700 resize-y"
              disabled={isSubmitting}
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="isPrivate"
                value="true"
                checked={showPrivateOption}
                onChange={(e) => setShowPrivateOption(e.target.checked)}
                className="w-4 h-4 border-harbour-300 text-harbour-600 focus:ring-harbour-500"
                disabled={isSubmitting}
              />
              <span className="text-sm text-harbour-600">
                Send as private feedback to webmasters
              </span>
            </label>
            {showPrivateOption && (
              <p className="text-xs text-harbour-400 ml-6">
                Private feedback is only visible to site administrators. Use this to suggest corrections or report issues.
              </p>
            )}
          </div>

          {turnstileSiteKey && (
            <TurnstileInput siteKey={turnstileSiteKey} className="mt-2" />
          )}

          {fetcher.data?.error && (
            <p className="text-red-600 text-sm">{fetcher.data.error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="self-start px-4 py-2 bg-harbour-600 text-white font-medium hover:bg-harbour-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Posting..." : "Post Comment"}
          </button>
        </fetcher.Form>

        {/* Public Comments */}
        {publicComments.length === 0 ? (
          <p className="text-harbour-400 text-sm">No comments yet. Be the first to share your thoughts!</p>
        ) : (
          <div className="flex flex-col gap-4">
            {publicComments.map((comment) => (
              <CommentCard key={comment.id} comment={comment} />
            ))}
          </div>
        )}

        {/* Private Comments (Admin Only) */}
        {isAdmin && privateComments.length > 0 && (
          <div className="mt-8 pt-6 border-t border-harbour-200/50">
            <h3 className="text-md font-semibold text-harbour-600 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Private Feedback ({privateComments.length})
            </h3>
            <div className="flex flex-col gap-4">
              {privateComments.map((comment) => (
                <CommentCard key={comment.id} comment={comment} isPrivate />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentCard({ comment, isPrivate = false }: { comment: Comment; isPrivate?: boolean }) {
  return (
    <div
      className={`p-4 ${
        isPrivate
          ? "bg-amber-50 ring-1 ring-amber-200"
          : "ring-1 ring-harbour-200/50"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-harbour-700">
          {comment.authorName || "Anonymous"}
        </span>
        <span className="text-xs text-harbour-400">
          {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
        </span>
      </div>
      <p className="text-harbour-600 whitespace-pre-wrap">{comment.content}</p>
      {isPrivate && (
        <span className="inline-block mt-2 text-xs px-2 py-1 bg-amber-100 text-amber-700">
          Private Feedback
        </span>
      )}
    </div>
  );
}
