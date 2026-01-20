import { useFetcher, Link } from "react-router";
import { useState, useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import type { ContentType } from "~/db/schema";
import type { CommentWithDepth } from "~/lib/comments.server";
import { TurnstileInput } from "./Turnstile";

const MAX_INLINE_DEPTH = 4; // After this depth, show "continue thread" link

interface CommentSectionProps {
  contentType: ContentType;
  contentId: number;
  comments: CommentWithDepth[];
  turnstileSiteKey: string | null;
  isAdmin?: boolean;
}

// Build a tree structure from flat comments
interface CommentNode extends CommentWithDepth {
  children: CommentNode[];
}

function buildCommentTree(comments: CommentWithDepth[]): CommentNode[] {
  const map = new Map<number, CommentNode>();
  const roots: CommentNode[] = [];

  // First pass: create nodes
  for (const comment of comments) {
    map.set(comment.id, { ...comment, children: [] });
  }

  // Second pass: build tree
  for (const comment of comments) {
    const node = map.get(comment.id)!;
    if (comment.parentId && map.has(comment.parentId)) {
      map.get(comment.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort roots by date (newest first) and children by date (oldest first)
  roots.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  
  function sortChildren(node: CommentNode) {
    node.children.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    node.children.forEach(sortChildren);
  }
  roots.forEach(sortChildren);

  return roots;
}

export function CommentSection({
  contentType,
  contentId,
  comments,
  turnstileSiteKey,
  isAdmin = false,
}: CommentSectionProps) {
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

  const publicComments = comments.filter((c) => !c.isPrivate);
  const privateComments = comments.filter((c) => c.isPrivate);
  const publicCount = publicComments.length;
  const privateCount = privateComments.length;

  // Build trees
  const publicTree = buildCommentTree(publicComments);
  const privateTree = buildCommentTree(privateComments);

  // Build summary text
  let summaryText: string;
  if (isAdmin) {
    const publicText = publicCount === 0 
      ? "No Comments" 
      : `${publicCount} Comment${publicCount === 1 ? "" : "s"}`;
    summaryText = privateCount > 0 
      ? `${publicText} (${privateCount} Private)` 
      : publicText;
  } else {
    summaryText = publicCount === 0 
      ? "No Comments" 
      : `${publicCount} Comment${publicCount === 1 ? "" : "s"}`;
  }

  const hasAnyComments = publicCount > 0 || (isAdmin && privateCount > 0);

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

        <div className="mt-4 flex flex-col gap-3">
          {/* Threaded Comments */}
          {publicTree.length > 0 && (
            <div className="flex flex-col">
              {publicTree.map((node) => (
                <CommentThread
                  key={node.id}
                  node={node}
                  contentType={contentType}
                  contentId={contentId}
                  turnstileSiteKey={turnstileSiteKey}
                  isAdmin={isAdmin}
                  replyingTo={replyingTo}
                  setReplyingTo={setReplyingTo}
                  isRoot
                />
              ))}
            </div>
          )}

          {/* Private Comments (Admin Only) */}
          {isAdmin && privateTree.length > 0 && (
            <div className="border-t border-harbour-200/50 pt-4 mt-2">
              <p className="text-xs font-medium text-amber-600 mb-2 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Private Comments ({privateComments.length})
              </p>
              <div className="flex flex-col">
                {privateTree.map((node) => (
                  <CommentThread
                    key={node.id}
                    node={node}
                    contentType={contentType}
                    contentId={contentId}
                    turnstileSiteKey={turnstileSiteKey}
                    isAdmin={isAdmin}
                    replyingTo={replyingTo}
                    setReplyingTo={setReplyingTo}
                    isPrivate
                    isRoot
                  />
                ))}
              </div>
            </div>
          )}

          {/* Top-level Comment Form */}
          {hasAnyComments ? (
            <details className="mt-2" open>
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
              <TopLevelCommentForm
                contentType={contentType}
                contentId={contentId}
                turnstileSiteKey={turnstileSiteKey}
              />
            </details>
          ) : (
            <TopLevelCommentForm
              contentType={contentType}
              contentId={contentId}
              turnstileSiteKey={turnstileSiteKey}
            />
          )}
        </div>
      </details>
    </div>
  );
}

interface CommentThreadProps {
  node: CommentNode;
  contentType: ContentType;
  contentId: number;
  turnstileSiteKey: string | null;
  isAdmin: boolean;
  replyingTo: number | null;
  setReplyingTo: (id: number | null) => void;
  isPrivate?: boolean;
  isRoot?: boolean;
  depth?: number;
  slug?: string; // For "continue thread" links
}

function CommentThread({
  node,
  contentType,
  contentId,
  turnstileSiteKey,
  isAdmin,
  replyingTo,
  setReplyingTo,
  isPrivate = false,
  isRoot = false,
  depth = 0,
}: CommentThreadProps) {
  const hasReplies = node.children.length > 0;
  const replyCount = countReplies(node);
  const atMaxDepth = depth >= MAX_INLINE_DEPTH;

  return (
    <div className={`${isRoot ? '' : 'ml-4 pl-3 border-l-2 border-harbour-200 hover:border-harbour-400 transition-colors'}`}>
      <CommentCard
        comment={node}
        isPrivate={isPrivate && node.isPrivate}
        isAdmin={isAdmin}
        onReply={() => setReplyingTo(node.id)}
        isReplyFormOpen={replyingTo === node.id}
      />
      
      {replyingTo === node.id && (
        <div className="mt-2 ml-4">
          <ReplyForm
            contentType={contentType}
            contentId={contentId}
            parentId={node.id}
            turnstileSiteKey={turnstileSiteKey}
            onCancel={() => setReplyingTo(null)}
            onSuccess={() => setReplyingTo(null)}
          />
        </div>
      )}

      {hasReplies && atMaxDepth ? (
        // At max depth: show "continue thread" link instead of inline replies
        <div className="mt-2 ml-4">
          <details className="group/continue">
            <summary className="cursor-pointer select-none text-xs text-harbour-500 hover:text-harbour-600 list-none flex items-center gap-1 py-1">
              <svg 
                className="w-3 h-3 transition-transform group-open/continue:rotate-90" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>Continue thread ({replyCount} more {replyCount === 1 ? 'reply' : 'replies'})</span>
            </summary>
            {/* Reset depth to 0 when expanding "continue thread" */}
            <div className="flex flex-col mt-1 pt-2 border-t border-harbour-100">
              {node.children.map((child) => (
                <CommentThread
                  key={child.id}
                  node={child}
                  contentType={contentType}
                  contentId={contentId}
                  turnstileSiteKey={turnstileSiteKey}
                  isAdmin={isAdmin}
                  replyingTo={replyingTo}
                  setReplyingTo={setReplyingTo}
                  isPrivate={isPrivate}
                  depth={0} // Reset depth for continued thread
                  isRoot // Treat as root (no left border) since we reset
                />
              ))}
            </div>
          </details>
        </div>
      ) : hasReplies ? (
        // Normal inline replies
        <details className="mt-1 group/replies" open>
          <summary className="cursor-pointer select-none text-xs text-harbour-400 hover:text-harbour-500 list-none flex items-center gap-1 ml-4 py-1">
            <svg 
              className="w-3 h-3 transition-transform group-open/replies:rotate-90" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
          </summary>
          <div className="flex flex-col mt-1">
            {node.children.map((child) => (
              <CommentThread
                key={child.id}
                node={child}
                contentType={contentType}
                contentId={contentId}
                turnstileSiteKey={turnstileSiteKey}
                isAdmin={isAdmin}
                replyingTo={replyingTo}
                setReplyingTo={setReplyingTo}
                isPrivate={isPrivate}
                depth={depth + 1}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function countReplies(node: CommentNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countReplies(child);
  }
  return count;
}

interface TopLevelCommentFormProps {
  contentType: ContentType;
  contentId: number;
  turnstileSiteKey: string | null;
}

function TopLevelCommentForm({
  contentType,
  contentId,
  turnstileSiteKey,
}: TopLevelCommentFormProps) {
  const fetcher = useFetcher();
  const [showPrivateOption, setShowPrivateOption] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success) {
      formRef.current?.reset();
      setShowPrivateOption(false);
    }
  }, [fetcher.data]);

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
        <a href="/conduct" className="link-inline text-harbour-500">
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

interface ReplyFormProps {
  contentType: ContentType;
  contentId: number;
  parentId: number;
  turnstileSiteKey: string | null;
  onCancel: () => void;
  onSuccess: () => void;
}

function ReplyForm({
  contentType,
  contentId,
  parentId,
  turnstileSiteKey,
  onCancel,
  onSuccess,
}: ReplyFormProps) {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success) {
      formRef.current?.reset();
      onSuccess();
    }
  }, [fetcher.data, onSuccess]);

  return (
    <fetcher.Form
      ref={formRef}
      method="post"
      action="/api/comments"
      className="flex flex-col gap-2 p-3 bg-harbour-50 ring-1 ring-harbour-200/50"
    >
      <input type="hidden" name="contentType" value={contentType} />
      <input type="hidden" name="contentId" value={contentId} />
      <input type="hidden" name="parentId" value={parentId} />

      <div className="flex flex-col gap-1">
        <input
          type="text"
          name="authorName"
          placeholder="Name (optional)"
          className="px-2 py-1 text-xs border border-harbour-200 focus:border-harbour-400 focus:outline-none text-harbour-700"
          disabled={isSubmitting}
        />
      </div>

      <textarea
        name="content"
        rows={2}
        required
        placeholder="Write a reply..."
        className="px-2 py-1 text-xs border border-harbour-200 focus:border-harbour-400 focus:outline-none text-harbour-700 resize-y"
        disabled={isSubmitting}
        autoFocus
      />

      {turnstileSiteKey && (
        <TurnstileInput siteKey={turnstileSiteKey} className="mt-1" />
      )}

      {(fetcher.data as { error?: string } | undefined)?.error && (
        <p className="text-red-600 text-xs">{(fetcher.data as { error: string }).error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-2 py-1 text-xs bg-harbour-600 text-white font-medium hover:bg-harbour-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Posting..." : "Reply"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-2 py-1 text-xs text-harbour-500 hover:text-harbour-700 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </fetcher.Form>
  );
}

function CommentCard({ 
  comment, 
  isPrivate = false,
  isAdmin = false,
  onReply,
  isReplyFormOpen,
}: { 
  comment: CommentWithDepth; 
  isPrivate?: boolean;
  isAdmin?: boolean;
  onReply: () => void;
  isReplyFormOpen: boolean;
}) {
  const fetcher = useFetcher();
  const isDeleting = fetcher.state !== "idle";

  return (
    <div
      className={`p-3 text-sm ${
        isPrivate
          ? "bg-amber-50 ring-1 ring-amber-200"
          : "bg-white ring-1 ring-harbour-200/50"
      } ${isDeleting ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-harbour-700 text-xs">
          {comment.authorName || "Anonymous"}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-harbour-400">
            {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
          </span>
          {isAdmin && (
            <fetcher.Form method="post" action="/api/comments/delete">
              <input type="hidden" name="commentId" value={comment.id} />
              <button
                type="submit"
                disabled={isDeleting}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                title="Delete comment"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </fetcher.Form>
          )}
        </div>
      </div>
      <p className="text-harbour-600 whitespace-pre-wrap">{comment.content}</p>
      <div className="flex items-center gap-2 mt-2">
        {!isReplyFormOpen && (
          <button
            onClick={onReply}
            className="text-xs text-harbour-400 hover:text-harbour-600 flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            reply
          </button>
        )}
        {isPrivate && (
          <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700">
            Private
          </span>
        )}
      </div>
    </div>
  );
}
