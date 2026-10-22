import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError, InvalidOperationError } from "../errors";
import { toPlain } from "../plain";
import { lookupInput, deleteInput } from "../fields";
import {
  newsArticleCreateInput,
  newsUpdateInput,
  newsLinkSubmitInput,
  newsListInput,
  newsOutput,
} from "../contracts/news";
import { createNews, updateNews, deleteNews, getNewsById, getAllNews } from "~/lib/news.server";
import { withEntityImages } from "~/lib/entity-images.server";
import { fetchNewsLinkMetadata } from "~/lib/news-link.server";
export async function requireNews(id: number) {
  const news = await getNewsById(id);
  if (!news) throw new NotFoundError("News item not found");
  return news;
}
export const newsOperations = {
  newsList: defineOperation({
    name: "newsList",
    area: "news",
    risk: "read",
    access: "admin",
    summary: "List news including drafts.",
    description: "Return a bounded page filtered by title, status, source, or article/link type.",
    input: newsListInput,
    output: z.array(newsOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      toPlain(
        (await getAllNews())
          .filter(
            (row) =>
              (!input.query || row.title.toLowerCase().includes(input.query.toLowerCase())) &&
              (input.status === undefined || row.status === input.status) &&
              (input.type === undefined || row.type === input.type) &&
              (input.sourceId === undefined || row.sourceId === input.sourceId),
          )
          .slice(input.offset, input.offset + input.limit),
      ),
  }),
  newsGet: defineOperation({
    name: "newsGet",
    area: "news",
    risk: "read",
    access: "admin",
    summary: "Get a news article or link.",
    description:
      "Look up a stored news record, including draft content, by ID, slug, or exact title.",
    input: lookupInput,
    output: newsOutput,
    examples: [{ title: "By ID", input: { id: 1 } }],
    run: async (_ctx, input) => {
      const row = input.id
        ? await getNewsById(input.id)
        : (await getAllNews()).find((row) =>
            input.slug
              ? row.slug === input.slug
              : row.title.toLowerCase() === input.name?.toLowerCase(),
          );
      if (!row) throw new NotFoundError("News item not found");
      return toPlain(row);
    },
  }),
  newsArticleCreate: defineOperation({
    name: "newsArticleCreate",
    area: "news",
    risk: "write",
    access: "admin",
    summary: "Create a news article or a manually entered link.",
    description:
      "Save supplied content without fetching its URL. Defaults to a draft article. Published records receive publishedAt from the operation clock unless explicitly supplied. Use newsLinkSubmit to fetch link metadata. Synchronize references and prepare cover images before writing.",
    input: newsArticleCreateInput,
    output: newsOutput,
    examples: [
      {
        title: "Draft article",
        input: { title: "Community update", content: "News from the harbour" },
      },
    ],
    run: async (ctx, { coverImage, publishedAt, ...fields }) =>
      toPlain(
        await withEntityImages({ type: "news" }, { cover: coverImage }, (images) =>
          createNews({
            ...fields,
            ...images,
            publishedAt:
              publishedAt !== undefined
                ? publishedAt
                  ? new Date(publishedAt)
                  : null
                : fields.status === "published"
                  ? ctx.now()
                  : null,
          }),
        ),
      ),
  }),
  newsUpdate: defineOperation({
    name: "newsUpdate",
    area: "news",
    risk: "write",
    access: "admin",
    summary: "Update a news article or link.",
    description:
      "Patch supplied fields; unknown keys and empty patches fail. Publishing sets publishedAt when absent; hiding preserves it. Explicit publishedAt wins, including null. Article content must remain nonempty. Renaming updates the slug; content updates synchronize references. Replaced covers are removed when unreferenced.",
    input: newsUpdateInput,
    output: newsOutput,
    examples: [{ title: "Publish", input: { id: 1, status: "published" } }],
    run: async (ctx, { id, coverImage, publishedAt, ...fields }) => {
      const current = await requireNews(id);
      if (fields.externalUrl === null && current.type === "link")
        throw new InvalidOperationError("Links require externalUrl");
      const date =
        publishedAt !== undefined
          ? publishedAt
            ? new Date(publishedAt)
            : null
          : fields.status === "published" && !current.publishedAt
            ? ctx.now()
            : undefined;
      return toPlain(
        (await withEntityImages({ type: "news", id }, { cover: coverImage }, (images) =>
          updateNews(id, {
            ...fields,
            ...images,
            ...(date !== undefined && { publishedAt: date }),
          }),
        ))!,
      );
    },
  }),
  newsLinkSubmit: defineOperation({
    name: "newsLinkSubmit",
    area: "news",
    risk: "external",
    access: "admin",
    summary: "Fetch and publish a news link.",
    description:
      "Fetch HTML through the public-address guard, extract title and description, and publish immediately with publishedAt from the operation clock. Optional title, excerpt, and sourceName override metadata. Requires confirm: true.",
    input: newsLinkSubmitInput,
    output: newsOutput,
    examples: [{ title: "Submit link", input: { url: "https://example.com/news", confirm: true } }],
    run: async (ctx, input) => {
      const metadata = await fetchNewsLinkMetadata(input.url);
      const excerpt = input.excerpt === undefined ? metadata.excerpt : input.excerpt;
      return toPlain(
        await createNews({
          type: "link",
          title: input.title ?? metadata.title,
          content: excerpt ?? "",
          excerpt,
          externalUrl: input.url,
          sourceName: input.sourceName === undefined ? metadata.sourceName : input.sourceName,
          status: "published",
          publishedAt: ctx.now(),
        }),
      );
    },
  }),
  newsDelete: defineOperation({
    name: "newsDelete",
    area: "news",
    risk: "destructive",
    access: "admin",
    summary: "Delete a news article or link.",
    description:
      "Remove the record and clean up unreferenced cover images. Requires confirm: true.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true), record: newsOutput }).strict(),
    examples: [{ title: "Delete", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id }) => {
      const record = await requireNews(id);
      await deleteNews(id);
      return { deleted: true as const, record: toPlain(record) };
    },
  }),
};
