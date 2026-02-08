import { getAllComments, getPublicComments } from "./comments.server";
import { areCommentsEnabled } from "./config.server";
import { getDetailedBacklinks, prepareRefsForClient } from "./references.server";
import { getOptionalUser } from "./session.server";
import { getTurnstileSiteKey } from "./turnstile.server";

type ContentType = "company" | "education" | "group" | "product" | "project";
type CommentsSection = "companies" | "education" | "groups" | "products" | "projects";

interface DirectoryCommonLoaderOptions {
  request: Request;
  contentType: ContentType;
  contentId: number;
  description: string;
  commentsSection: CommentsSection;
}

export async function loadDirectoryCommonData({
  request,
  contentType,
  contentId,
  description,
  commentsSection,
}: DirectoryCommonLoaderOptions) {
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const [resolvedRefs, backlinks, comments, commentsEnabled] = await Promise.all([
    prepareRefsForClient(description),
    getDetailedBacklinks(contentType, contentId),
    isAdmin ? getAllComments(contentType, contentId) : getPublicComments(contentType, contentId),
    areCommentsEnabled(commentsSection),
  ]);

  return {
    resolvedRefs,
    backlinks,
    comments,
    turnstileSiteKey: getTurnstileSiteKey(),
    isAdmin,
    commentsEnabled,
  };
}
