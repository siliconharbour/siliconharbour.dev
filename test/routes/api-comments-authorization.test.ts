import { describe, expect, it } from "vitest";
import { db } from "~/db";
import { comments, companies, news } from "~/db/schema";
import { setCommentVisibility } from "~/lib/config.server";
import { action } from "~/routes/api.comments";

function commentRequest(fields: Record<string, string>) {
  return new Request("http://localhost/api/comments", {
    method: "POST",
    body: new URLSearchParams({
      contentType: "company",
      contentId: "1",
      content: "A test comment",
      ...fields,
    }),
  });
}

describe("comment mutation authorization", () => {
  async function insertVisibleCompany() {
    await db.insert(companies).values({
      id: 1,
      slug: "test-company",
      name: "Test Company",
      description: "Test",
      visible: true,
    });
  }

  it("rejects a direct POST when comments are disabled", async () => {
    await setCommentVisibility("companies", false);

    const result = await action({
      request: commentRequest({}),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ error: "Comments are disabled for this content type" });
    expect(await db.select().from(comments)).toHaveLength(0);
  });

  it("does not allow direct POSTs to content types without a comment setting", async () => {
    for (const contentType of ["event", "person", "job"]) {
      const result = await action({
        request: commentRequest({ contentType }),
        params: {},
        context: {},
      } as never);

      expect(result).toEqual({ error: "Comments are not available for this content type" });
    }

    expect(await db.select().from(comments)).toHaveLength(0);
  });

  it("preserves anonymous comments for an explicitly enabled content type", async () => {
    await setCommentVisibility("companies", true);
    await insertVisibleCompany();

    const result = await action({
      request: commentRequest({}),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ success: true });
    expect(await db.select().from(comments)).toHaveLength(1);
  });

  it("rejects comments on hidden or nonexistent directory entries", async () => {
    await db.insert(companies).values({
      id: 1,
      slug: "hidden-company",
      name: "Hidden Company",
      description: "Test",
      visible: false,
    });

    expect(
      await action({ request: commentRequest({}), params: {}, context: {} } as never),
    ).toEqual({ error: "Content not found" });
    expect(
      await action({
        request: commentRequest({ contentId: "999" }),
        params: {},
        context: {},
      } as never),
    ).toEqual({ error: "Content not found" });
    expect(await db.select().from(comments)).toHaveLength(0);
  });

  it("rejects comments on unpublished news", async () => {
    await db.insert(news).values({
      id: 1,
      slug: "draft-news",
      title: "Draft news",
      content: "Test",
      status: "draft",
    });

    const result = await action({
      request: commentRequest({ contentType: "news" }),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ error: "Content not found" });
    expect(await db.select().from(comments)).toHaveLength(0);
  });
});
