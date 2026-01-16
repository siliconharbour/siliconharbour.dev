import { useFetcher } from "react-router";
import { useState, useEffect, useRef } from "react";
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
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmitting = fetcher.state !== "idle";

  // Reset form after successful submission
  useEffect(() => {
    if (fetcher.data?.success) {
      formRef.current?.reset();
      setShowPrivateOption(false);
    }
  }, [fetcher.data]);

  const publicComments = comments.filter((c) => !c.isPrivate);
  const privateComments = comments.filter((c) => c.isPrivate);
  const commentCount = publicComments.length;

  const summaryText = commentCount === 0 
    ? "No Comments" 
    : `${commentCount} Comment${commentCount === 1 ? "" : "s"}`;

  return (
    <div className="border-t border-harbour-200/50 pt-4 mt-6 text-sm">
      <details className="group">
        <summary className="cursor-pointer select-none text-harbour-500 hover:text-harbour-600 list-none flex items-center gap-2">
          <svg 
            className="w-4 h-4 transition-transform group-open:rotate-90" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span>{summaryText}</span>
        </summary>

        <div className="mt-4 pl-6 flex flex-col gap-4">
          {/* Existing Comments */}
          {publicComments.length > 0 && (
            <div className="flex flex-col gap-3">
              {publicComments.map((comment) => (
                <CommentCard key={comment.id} comment={comment} />
              ))}
            </div>
          )}

          {/* Private Comments (Admin Only) */}
          {isAdmin && privateComments.length > 0 && (
            <div className="border-t border-harbour-200/50 pt-4">
              <p className="text-xs font-medium text-amber-600 mb-2 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Private Feedback ({privateComments.length})
              </p>
              <div className="flex flex-col gap-3">
                {privateComments.map((comment) => (
                  <CommentCard key={comment.id} comment={comment} isPrivate />
                ))}
              </div>
            </div>
          )}

          {/* Comment Form - wrapped in details only if there are existing comments */}
          {commentCount > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer select-none text-harbour-400 hover:text-harbour-500 list-none flex items-center gap-2 text-xs">
                <svg 
                  className="w-3 h-3" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Leave a comment</span>
              </summary>
              <CommentForm
                formRef={formRef}
                fetcher={fetcher}
                contentType={contentType}
                contentId={contentId}
                showPrivateOption={showPrivateOption}
                setShowPrivateOption={setShowPrivateOption}
                isSubmitting={isSubmitting}
                turnstileSiteKey={turnstileSiteKey}
              />
            </details>
          ) : (
            <CommentForm
              formRef={formRef}
              fetcher={fetcher}
              contentType={contentType}
              contentId={contentId}
              showPrivateOption={showPrivateOption}
              setShowPrivateOption={setShowPrivateOption}
              isSubmitting={isSubmitting}
              turnstileSiteKey={turnstileSiteKey}
            />
          )}
        </div>
      </details>
    </div>
  );
}

interface CommentFormProps {
  formRef: React.RefObject<HTMLFormElement | null>;
  fetcher: ReturnType<typeof useFetcher>;
  contentType: ContentType;
  contentId: number;
  showPrivateOption: boolean;
  setShowPrivateOption: (value: boolean) => void;
  isSubmitting: boolean;
  turnstileSiteKey: string | null;
}

function CommentForm({
  formRef,
  fetcher,
  contentType,
  contentId,
  showPrivateOption,
  setShowPrivateOption,
  isSubmitting,
  turnstileSiteKey,
}: CommentFormProps) {
  return (
    <fetcher.Form
      ref={formRef}
      method="post"
      action="/api/comments"
      className="mt-3 flex flex-col gap-3"
    >
      <input type="hidden" name="contentType" value={contentType} />
      <input type="hidden" name="contentId" value={contentId} />

      <div className="flex flex-col gap-1">
        <label htmlFor="authorName" className="text-xs font-medium text-harbour-500">
          Name <span className="text-harbour-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          id="authorName"
          name="authorName"
          placeholder="Anonymous"
          className="px-2 py-1.5 text-sm border border-harbour-200 focus:border-harbour-400 focus:outline-none text-harbour-700"
          disabled={isSubmitting}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="content" className="text-xs font-medium text-harbour-500">
          Comment
        </label>
        <textarea
          id="content"
          name="content"
          rows={3}
          required
          placeholder="Share your thoughts..."
          className="px-2 py-1.5 text-sm border border-harbour-200 focus:border-harbour-400 focus:outline-none text-harbour-700 resize-y"
          disabled={isSubmitting}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="isPrivate"
            value="true"
            checked={showPrivateOption}
            onChange={(e) => setShowPrivateOption(e.target.checked)}
            className="w-3 h-3 border-harbour-300 text-harbour-600 focus:ring-harbour-500"
            disabled={isSubmitting}
          />
          <span className="text-xs text-harbour-500">
            Send as private feedback to webmasters
          </span>
        </label>
        {showPrivateOption && (
          <p className="text-xs text-harbour-400 ml-5">
            Private feedback is only visible to site administrators.
          </p>
        )}
      </div>

      <p className="text-xs text-harbour-400">
        By submitting, you agree to our{" "}
        <a href="/conduct" className="text-harbour-500 hover:text-harbour-600 underline">
          community guidelines
        </a>.
      </p>

      {turnstileSiteKey && (
        <TurnstileInput siteKey={turnstileSiteKey} className="mt-1" />
      )}

      {(fetcher.data as { error?: string } | undefined)?.error && (
        <p className="text-red-600 text-xs">{(fetcher.data as { error: string }).error}</p>
      )}

      {(fetcher.data as { success?: boolean } | undefined)?.success && (
        <p className="text-green-600 text-xs">Comment posted successfully!</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="self-start px-3 py-1.5 text-xs bg-harbour-600 text-white font-medium hover:bg-harbour-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Posting..." : "Post Comment"}
      </button>
    </fetcher.Form>
  );
}

function CommentCard({ comment, isPrivate = false }: { comment: Comment; isPrivate?: boolean }) {
  return (
    <div
      className={`p-3 text-sm ${
        isPrivate
          ? "bg-amber-50 ring-1 ring-amber-200"
          : "ring-1 ring-harbour-200/50"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-harbour-700 text-xs">
          {comment.authorName || "Anonymous"}
        </span>
        <span className="text-xs text-harbour-400">
          {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
        </span>
      </div>
      <p className="text-harbour-600 whitespace-pre-wrap">{comment.content}</p>
      {isPrivate && (
        <span className="inline-block mt-1 text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700">
          Private
        </span>
      )}
    </div>
  );
}
