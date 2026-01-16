import type { Route } from "./+types/api.comments";
import { createComment } from "~/lib/comments.server";
import { verifyTurnstile } from "~/lib/turnstile.server";
import { contentTypes, type ContentType } from "~/db/schema";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  
  const contentType = formData.get("contentType") as string;
  const contentIdStr = formData.get("contentId") as string;
  const authorName = formData.get("authorName") as string | null;
  const content = formData.get("content") as string;
  const isPrivate = formData.get("isPrivate") === "true";
  const turnstileToken = formData.get("cf-turnstile-response") as string;

  // Validate content type
  if (!contentType || !contentTypes.includes(contentType as ContentType)) {
    return { error: "Invalid content type" };
  }

  // Validate content ID
  const contentId = parseInt(contentIdStr, 10);
  if (isNaN(contentId) || contentId <= 0) {
    return { error: "Invalid content ID" };
  }

  // Validate comment content
  if (!content || content.trim().length === 0) {
    return { error: "Comment cannot be empty" };
  }

  if (content.length > 5000) {
    return { error: "Comment is too long (max 5000 characters)" };
  }

  // Verify Turnstile (skip if in dev without key configured)
  if (turnstileToken || process.env.TURNSTILE_SECRET_KEY) {
    const clientIP = request.headers.get("CF-Connecting-IP") 
      || request.headers.get("X-Forwarded-For")?.split(",")[0]
      || undefined;
    
    const isValid = await verifyTurnstile(turnstileToken || "", clientIP);
    if (!isValid) {
      return { error: "Verification failed. Please try again." };
    }
  }

  // Get client IP for rate limiting
  const clientIP = request.headers.get("CF-Connecting-IP") 
    || request.headers.get("X-Forwarded-For")?.split(",")[0]
    || request.headers.get("X-Real-IP")
    || undefined;

  try {
    await createComment(
      {
        contentType: contentType as ContentType,
        contentId,
        authorName: authorName?.trim() || null,
        content: content.trim(),
        isPrivate,
      },
      clientIP
    );

    return { success: true };
  } catch (error) {
    console.error("Error creating comment:", error);
    return { error: "Failed to post comment. Please try again." };
  }
}
