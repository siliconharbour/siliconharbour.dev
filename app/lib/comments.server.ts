import { db } from "~/db";
import { comments, type Comment, type NewComment, type ContentType } from "~/db/schema";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";

/**
 * Hash an IP address for privacy-preserving spam prevention
 */
function hashIP(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/**
 * Create a new comment
 */
export async function createComment(
  comment: Omit<NewComment, "ipHash" | "ipAddress" | "userAgent">,
  metadata?: { ip?: string; userAgent?: string }
): Promise<Comment> {
  const [newComment] = await db
    .insert(comments)
    .values({
      ...comment,
      ipAddress: metadata?.ip || null,
      ipHash: metadata?.ip ? hashIP(metadata.ip) : null,
      userAgent: metadata?.userAgent || null,
    })
    .returning();

  return newComment;
}

/**
 * Get all public comments for a piece of content
 */
export async function getPublicComments(
  contentType: ContentType,
  contentId: number
): Promise<Comment[]> {
  return db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.contentType, contentType),
        eq(comments.contentId, contentId),
        eq(comments.isPrivate, false)
      )
    )
    .orderBy(desc(comments.createdAt));
}

/**
 * Get all comments (including private) for a piece of content - for admins
 */
export async function getAllComments(
  contentType: ContentType,
  contentId: number
): Promise<Comment[]> {
  return db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.contentType, contentType),
        eq(comments.contentId, contentId)
      )
    )
    .orderBy(desc(comments.createdAt));
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
  windowMinutes: number = 60
): Promise<number> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  
  const result = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.contentType, contentType),
        eq(comments.contentId, contentId),
        eq(comments.ipHash, ipHash)
      )
    );
  
  // Filter by time in JS since SQLite timestamp comparison is tricky
  return result.filter(c => c.createdAt >= windowStart).length;
}
