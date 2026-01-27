import { db } from "~/db";
import {
  comments,
  contentTypes,
  type Comment,
  type NewComment,
  type ContentType,
} from "~/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import crypto from "crypto";

/**
 * Validate and sanitize contentType to prevent SQL injection.
 * Throws if invalid.
 */
function validateContentType(contentType: string): ContentType {
  if (!contentTypes.includes(contentType as ContentType)) {
    throw new Error(`Invalid content type: ${contentType}`);
  }
  return contentType as ContentType;
}

/**
 * Validate and sanitize contentId to prevent SQL injection.
 * Throws if invalid.
 */
function validateContentId(contentId: number): number {
  if (!Number.isInteger(contentId) || contentId <= 0) {
    throw new Error(`Invalid content ID: ${contentId}`);
  }
  return contentId;
}

/**
 * Comment with depth information for nested display
 */
export interface CommentWithDepth extends Comment {
  depth: number;
}

/**
 * Hash an IP address for privacy-preserving spam prevention
 */
export function hashIP(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/**
 * Create a new comment
 */
export async function createComment(
  comment: Omit<NewComment, "ipHash" | "ipAddress" | "userAgent">,
  metadata?: { ip?: string; userAgent?: string },
): Promise<Comment> {
  const [newComment] = await db
    .insert(comments)
    .values({
      ...comment,
      parentId: comment.parentId || null,
      ipAddress: metadata?.ip || null,
      ipHash: metadata?.ip ? hashIP(metadata.ip) : null,
      userAgent: metadata?.userAgent || null,
    })
    .returning();

  return newComment;
}

/**
 * Get all public comments for a piece of content with threading
 */
export async function getPublicComments(
  contentType: ContentType,
  contentId: number,
): Promise<CommentWithDepth[]> {
  return getThreadedComments(contentType, contentId, false);
}

/**
 * Get threaded comments with depth using recursive CTE.
 * Returns a flat list sorted for display:
 * - Top-level comments sorted newest first
 * - Replies sorted chronologically within their thread
 * - Each comment includes its depth for indentation
 */
export async function getThreadedComments(
  contentType: ContentType,
  contentId: number,
  includePrivate: boolean = false,
): Promise<CommentWithDepth[]> {
  // Validate inputs to prevent SQL injection (even though we use validated types,
  // this provides defense-in-depth since we use raw SQL below)
  const safeContentType = validateContentType(contentType);
  const safeContentId = validateContentId(contentId);

  // Use raw SQL for recursive CTE - Drizzle doesn't support WITH RECURSIVE natively
  // Note: contentType is validated against a strict enum whitelist above,
  // and contentId is validated as a positive integer, making injection impossible
  const privateFilterBase = includePrivate ? "" : "AND is_private = 0";
  const privateFilterRecursive = includePrivate ? "" : "AND c.is_private = 0";

  const result = await db.all<CommentWithDepth>(
    sql.raw(`
    WITH RECURSIVE comment_tree AS (
      -- Base case: top-level comments (no parent)
      SELECT 
        id, content_type, content_id, parent_id, author_name, content, 
        is_private, ip_address, ip_hash, user_agent, created_at,
        0 as depth,
        -- For sorting: top-level uses negative timestamp (newest first)
        -- path tracks the thread hierarchy for proper ordering
        printf('%020d', 9999999999999 - created_at) as sort_path
      FROM comments 
      WHERE content_type = '${safeContentType}' 
        AND content_id = ${safeContentId} 
        AND parent_id IS NULL
        ${privateFilterBase}
      
      UNION ALL
      
      -- Recursive case: child comments
      SELECT 
        c.id, c.content_type, c.content_id, c.parent_id, c.author_name, c.content,
        c.is_private, c.ip_address, c.ip_hash, c.user_agent, c.created_at,
        ct.depth + 1 as depth,
        -- Append child timestamp (oldest first within thread)
        ct.sort_path || '/' || printf('%020d', c.created_at) as sort_path
      FROM comments c
      JOIN comment_tree ct ON c.parent_id = ct.id
      WHERE c.content_type = '${safeContentType}'
        AND c.content_id = ${safeContentId}
        ${privateFilterRecursive}
    )
    SELECT 
      id, content_type as contentType, content_id as contentId, 
      parent_id as parentId, author_name as authorName, content,
      is_private as isPrivate, ip_address as ipAddress, ip_hash as ipHash,
      user_agent as userAgent, created_at as createdAt, depth
    FROM comment_tree 
    ORDER BY sort_path
  `),
  );

  // Convert timestamps and booleans from SQLite format
  return result.map((row) => ({
    ...row,
    createdAt: new Date((row.createdAt as unknown as number) * 1000),
    isPrivate: Boolean(row.isPrivate),
    parentId: row.parentId || null,
  }));
}

/**
 * Get all comments (including private) for a piece of content - for admins
 * Uses threaded format with depth
 */
export async function getAllComments(
  contentType: ContentType,
  contentId: number,
): Promise<CommentWithDepth[]> {
  return getThreadedComments(contentType, contentId, true);
}

/**
 * Get all private comments across all content - for admin review
 */
export async function getPrivateComments(): Promise<Comment[]> {
  return db
    .select()
    .from(comments)
    .where(eq(comments.isPrivate, true))
    .orderBy(desc(comments.createdAt));
}

/**
 * Delete a comment
 */
export async function deleteComment(id: number): Promise<boolean> {
  await db.delete(comments).where(eq(comments.id, id));
  return true;
}

/**
 * Get comment by ID
 */
export async function getCommentById(id: number): Promise<Comment | null> {
  return db.select().from(comments).where(eq(comments.id, id)).get() ?? null;
}

/**
 * Get recent comments count for a piece of content (for rate limiting)
 */
export async function getRecentCommentCount(
  contentType: ContentType,
  contentId: number,
  ipHash: string,
  windowMinutes: number = 60,
): Promise<number> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const result = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.contentType, contentType),
        eq(comments.contentId, contentId),
        eq(comments.ipHash, ipHash),
      ),
    );

  // Filter by time in JS since SQLite timestamp comparison is tricky
  return result.filter((c) => c.createdAt >= windowStart).length;
}

/**
 * Get paginated comments for admin view
 */
export async function getPaginatedComments(
  page: number = 1,
  perPage: number = 20,
): Promise<{ comments: Comment[]; total: number; totalPages: number }> {
  const offset = (page - 1) * perPage;

  const [allComments, countResult] = await Promise.all([
    db.select().from(comments).orderBy(desc(comments.createdAt)).limit(perPage).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(comments),
  ]);

  const total = countResult[0]?.count ?? 0;
  const totalPages = Math.ceil(total / perPage);

  return { comments: allComments, total, totalPages };
}

/**
 * Get total comment count
 */
export async function getCommentCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(comments);
  return result[0]?.count ?? 0;
}
