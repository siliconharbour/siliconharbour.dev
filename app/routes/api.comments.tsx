import type { Route } from "./+types/api.comments";
import { createComment, getCommentById, hashIP } from "~/lib/comments.server";
import { verifyTurnstile, isTurnstileEnabled } from "~/lib/turnstile.server";
import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import {
  companies,
  contentTypes,
  education,
  groups,
  news,
  products,
  projects,
  type ContentType,
} from "~/db/schema";
import { areCommentsEnabled } from "~/lib/config.server";
import {
  checkRateLimit,
  cleanupExpiredRateLimits,
  commentRateLimitKey,
  COMMENT_RATE_LIMIT,
  COMMENT_RATE_WINDOW,
} from "~/lib/ratelimit.server";

const commentSettingsByContentType = {
  company: "companies",
  group: "groups",
  education: "education",
  project: "projects",
  product: "products",
  news: "news",
} as const satisfies Partial<Record<ContentType, Parameters<typeof areCommentsEnabled>[0]>>;

async function isPublicCommentTarget(contentType: keyof typeof commentSettingsByContentType, id: number) {
  switch (contentType) {
    case "company":
      return Boolean(
        await db
          .select({ id: companies.id })
          .from(companies)
          .where(and(eq(companies.id, id), eq(companies.visible, true)))
          .get(),
      );
    case "group":
      return Boolean(
        await db
          .select({ id: groups.id })
          .from(groups)
          .where(and(eq(groups.id, id), eq(groups.visible, true)))
          .get(),
      );
    case "education":
      return Boolean(
        await db
          .select({ id: education.id })
          .from(education)
          .where(and(eq(education.id, id), eq(education.visible, true)))
          .get(),
      );
    case "project":
      return Boolean(
        await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get(),
      );
    case "product":
      return Boolean(
        await db.select({ id: products.id }).from(products).where(eq(products.id, id)).get(),
      );
    case "news":
      return Boolean(
        await db
          .select({ id: news.id })
          .from(news)
          .where(and(eq(news.id, id), eq(news.status, "published")))
          .get(),
      );
  }
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();

  const contentType = formData.get("contentType") as string;
  const contentIdStr = formData.get("contentId") as string;
  const parentIdStr = formData.get("parentId") as string | null;
  const authorName = formData.get("authorName") as string | null;
  const content = formData.get("content") as string;
  const isPrivate = formData.get("isPrivate") === "true";
  const turnstileToken = formData.get("cf-turnstile-response") as string;

  // Validate content type
  if (!contentType || !contentTypes.includes(contentType as ContentType)) {
    return { error: "Invalid content type" };
  }

  const commentSetting = commentSettingsByContentType[contentType as keyof typeof commentSettingsByContentType];
  if (!commentSetting) {
    return { error: "Comments are not available for this content type" };
  }
  if (!(await areCommentsEnabled(commentSetting))) {
    return { error: "Comments are disabled for this content type" };
  }

  // Validate content ID
  const contentId = parseInt(contentIdStr, 10);
  if (isNaN(contentId) || contentId <= 0) {
    return { error: "Invalid content ID" };
  }
  if (!(await isPublicCommentTarget(contentType as keyof typeof commentSettingsByContentType, contentId))) {
    return { error: "Content not found" };
  }

  // Validate parent ID if provided (for replies)
  let parentId: number | null = null;
  if (parentIdStr && parentIdStr.trim()) {
    parentId = parseInt(parentIdStr, 10);
    if (isNaN(parentId) || parentId <= 0) {
      return { error: "Invalid parent comment ID" };
    }
    // Verify parent comment exists and belongs to same content
    const parentComment = await getCommentById(parentId);
    if (!parentComment) {
      return { error: "Parent comment not found" };
    }
    if (parentComment.contentType !== contentType || parentComment.contentId !== contentId) {
      return { error: "Parent comment belongs to different content" };
    }
  }

  // Validate comment content
  if (!content || content.trim().length === 0) {
    return { error: "Comment cannot be empty" };
  }

  if (content.length > 5000) {
    return { error: "Comment is too long (max 5000 characters)" };
  }

  // Verify Turnstile if enabled (always verify when secret key is configured)
  if (isTurnstileEnabled()) {
    const clientIP =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For")?.split(",")[0] ||
      undefined;

    const isValid = await verifyTurnstile(turnstileToken || "", clientIP);
    if (!isValid) {
      return { error: "Verification failed. Please try again." };
    }
  }

  // Get client metadata for spam management
  const clientIP =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0] ||
    request.headers.get("X-Real-IP") ||
    undefined;
  const userAgent = request.headers.get("User-Agent") || undefined;

  // Rate limiting - 10 comments per 30 minutes per IP
  if (clientIP) {
    const ipHash = hashIP(clientIP);
    const rateLimit = await checkRateLimit(
      commentRateLimitKey(ipHash),
      COMMENT_RATE_LIMIT,
      COMMENT_RATE_WINDOW,
    );

    if (!rateLimit.allowed) {
      const minutesLeft = Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 60000);
      return {
        error: `Please wait ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"} before posting again.`,
      };
    }

    // Opportunistically clean up expired entries (1% of requests)
    if (Math.random() < 0.01) {
      cleanupExpiredRateLimits().catch(() => {});
    }
  }

  try {
    await createComment(
      {
        contentType: contentType as ContentType,
        contentId,
        parentId,
        authorName: authorName?.trim() || null,
        content: content.trim(),
        isPrivate,
      },
      { ip: clientIP, userAgent },
    );

    return { success: true };
  } catch (error) {
    console.error("Error creating comment:", error);
    return { error: "Failed to post comment. Please try again." };
  }
}
