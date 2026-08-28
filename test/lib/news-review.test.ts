import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "~/db";
import { news, newsImportSources } from "~/db/schema";
import {
  approveNewsItem,
  getAllPendingNews,
  hideAllPendingNews,
  hideNewsItem,
} from "~/lib/news-importers/sync.server";

async function seedSource() {
  const [source] = await db
    .insert(newsImportSources)
    .values({ name: "Local Feed", sourceType: "rss", sourceUrl: "https://example.com/feed.xml" })
    .returning();
  return source;
}

async function seedNews(status: "draft" | "pending_review" | "published" | "hidden", title: string) {
  const source = await seedSource();
  const [item] = await db
    .insert(news)
    .values({
      slug: `${title.toLowerCase().replaceAll(" ", "-")}-${Math.random().toString(36).slice(2)}`,
      title,
      status,
      sourceId: source.id,
      sourceName: source.name,
      externalUrl: `https://example.com/${title.toLowerCase().replaceAll(" ", "-")}`,
    })
    .returning();
  return { item, source };
}

describe("news review queue", () => {
  it("returns only pending news with import source context", async () => {
    const { item, source } = await seedNews("pending_review", "Review Me");
    await seedNews("published", "Already Published");

    const results = await getAllPendingNews();

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: item.id,
      title: "Review Me",
      sourceName: "Local Feed",
      sourceType: source.sourceType,
    });
  });

  it("approves and hides individual items", async () => {
    const { item: approved } = await seedNews("pending_review", "Approve Me");
    const { item: hidden } = await seedNews("pending_review", "Hide Me");

    await approveNewsItem(approved.id);
    await hideNewsItem(hidden.id);

    const [approvedRow] = await db.select().from(news).where(eq(news.id, approved.id));
    const [hiddenRow] = await db.select().from(news).where(eq(news.id, hidden.id));
    expect(approvedRow.status).toBe("published");
    expect(hiddenRow.status).toBe("hidden");
  });

  it("bulk hides pending items without changing drafts or published items", async () => {
    await seedNews("pending_review", "Pending One");
    await seedNews("pending_review", "Pending Two");
    const { item: draft } = await seedNews("draft", "Draft");
    const { item: published } = await seedNews("published", "Published");

    expect(await hideAllPendingNews()).toBe(2);

    const rows = await db.select().from(news);
    expect(rows.filter((item) => item.status === "hidden")).toHaveLength(2);
    expect(rows.find((item) => item.id === draft.id)?.status).toBe("draft");
    expect(rows.find((item) => item.id === published.id)?.status).toBe("published");
  });
});
