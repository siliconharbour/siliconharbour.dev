import { keywordList } from "~/lib/keywords";
import { z } from "zod";
import { defineOperation } from "../define";
import { toPlain } from "../plain";
import { idInput, confirm, emptyInput } from "../fields";
import { newsOutput } from "../contracts/news";
import { requireNews } from "./news.server";
import { updateNews } from "~/lib/news.server";
import { hideNewsItem, unhideNewsItem, hideAllPendingNews } from "~/lib/news-importers/sync.server";
import { getNewsGlobalKeywords, setNewsGlobalKeywords } from "~/lib/config.server";
export const newsStatusOperations = {
  newsApprove: defineOperation({
    name: "newsApprove",
    area: "news",
    risk: "write",
    access: "admin",
    summary: "Approve and publish a news item.",
    description:
      "Set status to published and set publishedAt from the operation clock only when absent. Preserve an existing publish date.",
    input: idInput,
    output: newsOutput,
    examples: [{ title: "Approve", input: { id: 1 } }],
    run: async (ctx, { id }) => {
      const current = await requireNews(id);
      return toPlain(
        (await updateNews(id, {
          status: "published",
          publishedAt: current.publishedAt ?? ctx.now(),
        }))!,
      );
    },
  }),
  newsHide: defineOperation({
    name: "newsHide",
    area: "news",
    risk: "write",
    access: "admin",
    summary: "Hide a news item.",
    description: "Set status to hidden and preserve publishedAt. The record remains editable.",
    input: idInput,
    output: newsOutput,
    examples: [{ title: "Hide", input: { id: 1 } }],
    run: async (_ctx, { id }) => {
      await requireNews(id);
      await hideNewsItem(id);
      return toPlain(await requireNews(id));
    },
  }),
  newsUnhide: defineOperation({
    name: "newsUnhide",
    area: "news",
    risk: "write",
    access: "admin",
    summary: "Return hidden news to review.",
    description:
      "Set status to pending_review. This does not publish the item or reset its publish date.",
    input: idInput,
    output: newsOutput,
    examples: [{ title: "Return to review", input: { id: 1 } }],
    run: async (_ctx, { id }) => {
      await requireNews(id);
      await unhideNewsItem(id);
      return toPlain(await requireNews(id));
    },
  }),
  newsHideAllPending: defineOperation({
    name: "newsHideAllPending",
    area: "news",
    risk: "destructive",
    access: "admin",
    summary: "Hide every pending news item.",
    description:
      "Set pending_review items to hidden without deleting them. Requires confirm: true.",
    input: z.object({ confirm }).strict(),
    output: z.object({ hidden: z.number() }).strict(),
    examples: [{ title: "Hide pending", input: { confirm: true } }],
    run: async () => ({ hidden: await hideAllPendingNews() }),
  }),
  newsGlobalKeywordsGet: defineOperation({
    name: "newsGlobalKeywordsGet",
    area: "news",
    risk: "read",
    access: "admin",
    summary: "Get global news import keywords.",
    description: "Return the keyword array used by news sources that enable global filtering.",
    input: emptyInput,
    output: keywordList,
    examples: [{ title: "Get keywords", input: {} }],
    run: () => getNewsGlobalKeywords(),
  }),
  newsGlobalKeywordsSet: defineOperation({
    name: "newsGlobalKeywordsSet",
    area: "news",
    risk: "write",
    access: "admin",
    summary: "Set global news import keywords.",
    description:
      "Replace the keyword array; null or an empty array clears it. Source-specific keywords remain unchanged.",
    input: z.object({ keywords: keywordList.nullable() }).strict(),
    output: z.object({ saved: z.literal(true) }).strict(),
    examples: [{ title: "Set keywords", input: { keywords: ["Newfoundland", "technology"] } }],
    run: async (_ctx, { keywords }) => {
      await setNewsGlobalKeywords(keywords ?? []);
      return { saved: true as const };
    },
  }),
};
