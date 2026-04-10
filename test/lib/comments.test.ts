import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { comments } from "~/db/schema";
import { eq } from "drizzle-orm";
import {
  createComment,
  getPublicComments,
  getThreadedComments,
  deleteComment,
  hashIP,
} from "~/lib/comments.server";

// =============================================================================
// Validation (tested via public API — validateContentType / validateContentId
// are module-private but exercised by getThreadedComments / getPublicComments)
// =============================================================================

describe("validateContentType (via getPublicComments)", () => {
  const validTypes = [
    "event",
    "company",
    "group",
    "education",
    "person",
    "news",
    "job",
    "project",
    "product",
  ] as const;

  for (const ct of validTypes) {
    it(`accepts valid content type: ${ct}`, async () => {
      // Should not throw — returns empty array for valid type with no data
      const result = await getPublicComments(ct, 1);
      expect(result).toEqual([]);
    });
  }

  it("rejects invalid content type", async () => {
    await expect(
      getPublicComments("invalid_type" as any, 1),
    ).rejects.toThrow("Invalid content type");
  });
});

describe("validateContentId (via getPublicComments)", () => {
  it("accepts positive integer content ID", async () => {
    const result = await getPublicComments("event", 1);
    expect(result).toEqual([]);
  });

  it("rejects zero content ID", async () => {
    await expect(getPublicComments("event", 0)).rejects.toThrow(
      "Invalid content ID",
    );
  });

  it("rejects negative content ID", async () => {
    await expect(getPublicComments("event", -5)).rejects.toThrow(
      "Invalid content ID",
    );
  });

  it("rejects NaN content ID", async () => {
    await expect(getPublicComments("event", NaN)).rejects.toThrow(
      "Invalid content ID",
    );
  });

  it("rejects non-integer content ID", async () => {
    await expect(getPublicComments("event", 1.5)).rejects.toThrow(
      "Invalid content ID",
    );
  });
});

// =============================================================================
// CRUD
// =============================================================================

describe("createComment", () => {
  it("inserts a comment with correct fields", async () => {
    const comment = await createComment(
      {
        contentType: "event",
        contentId: 1,
        authorName: "Alice",
        content: "Great event!",
        isPrivate: false,
      },
      { ip: "192.168.1.1", userAgent: "TestBrowser/1.0" },
    );

    expect(comment.id).toBeDefined();
    expect(comment.contentType).toBe("event");
    expect(comment.contentId).toBe(1);
    expect(comment.authorName).toBe("Alice");
    expect(comment.content).toBe("Great event!");
    expect(comment.isPrivate).toBe(false);
    expect(comment.ipAddress).toBe("192.168.1.1");
    expect(comment.ipHash).toBe(hashIP("192.168.1.1"));
    expect(comment.userAgent).toBe("TestBrowser/1.0");
    expect(comment.parentId).toBeNull();
  });

  it("inserts comment without metadata", async () => {
    const comment = await createComment({
      contentType: "company",
      contentId: 5,
      authorName: null,
      content: "Anonymous comment",
      isPrivate: false,
    });

    expect(comment.ipAddress).toBeNull();
    expect(comment.ipHash).toBeNull();
    expect(comment.userAgent).toBeNull();
  });
});

describe("getPublicComments", () => {
  it("returns only non-private comments", async () => {
    // Insert a public comment
    await db.insert(comments).values({
      contentType: "event",
      contentId: 1,
      content: "Public comment",
      isPrivate: false,
    });

    // Insert a private comment
    await db.insert(comments).values({
      contentType: "event",
      contentId: 1,
      content: "Private comment",
      isPrivate: true,
    });

    const result = await getPublicComments("event", 1);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Public comment");
    expect(result[0].isPrivate).toBe(false);
  });

  it("returns empty array for content with no comments", async () => {
    const result = await getPublicComments("event", 999);
    expect(result).toEqual([]);
  });
});

describe("getThreadedComments — threading", () => {
  it("returns parent and child comments with correct depth", async () => {
    // Insert parent comment
    const [parent] = await db
      .insert(comments)
      .values({
        contentType: "event",
        contentId: 1,
        authorName: "Alice",
        content: "Top-level comment",
        isPrivate: false,
      })
      .returning();

    // Insert child reply
    await db.insert(comments).values({
      contentType: "event",
      contentId: 1,
      parentId: parent.id,
      authorName: "Bob",
      content: "Reply to Alice",
      isPrivate: false,
    });

    const result = await getThreadedComments("event", 1, false);
    expect(result).toHaveLength(2);

    // Parent first at depth 0
    expect(result[0].content).toBe("Top-level comment");
    expect(result[0].depth).toBe(0);
    expect(result[0].parentId).toBeNull();

    // Child at depth 1
    expect(result[1].content).toBe("Reply to Alice");
    expect(result[1].depth).toBe(1);
    expect(result[1].parentId).toBe(parent.id);
  });

  it("includes private comments when includePrivate is true", async () => {
    await db.insert(comments).values({
      contentType: "event",
      contentId: 2,
      content: "Public",
      isPrivate: false,
    });
    await db.insert(comments).values({
      contentType: "event",
      contentId: 2,
      content: "Private",
      isPrivate: true,
    });

    const withPrivate = await getThreadedComments("event", 2, true);
    expect(withPrivate).toHaveLength(2);

    const withoutPrivate = await getThreadedComments("event", 2, false);
    expect(withoutPrivate).toHaveLength(1);
    expect(withoutPrivate[0].content).toBe("Public");
  });
});

describe("deleteComment", () => {
  it("removes the comment from the database", async () => {
    const [inserted] = await db
      .insert(comments)
      .values({
        contentType: "event",
        contentId: 1,
        content: "To be deleted",
        isPrivate: false,
      })
      .returning();

    const result = await deleteComment(inserted.id);
    expect(result).toBe(true);

    const remaining = await db
      .select()
      .from(comments)
      .where(eq(comments.id, inserted.id));
    expect(remaining).toHaveLength(0);
  });
});
