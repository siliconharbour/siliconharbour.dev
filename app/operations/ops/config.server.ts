import { siteConfigSaveInput } from "../contracts/config";
import { saveSiteConfig } from "~/lib/config.server";
import { defineOperation } from "../define";
import { emptyInput } from "../fields";
import {
  siteConfigOutput,
  sectionVisibilityInput,
  commentVisibilityInput,
  sectionVisibility,
  commentVisibility,
  discordConfigOutput,
  discordConfigSetInput,
} from "../contracts/config";
import {
  getSectionVisibility,
  updateSectionVisibility,
  getCommentVisibility,
  updateCommentVisibility,
  getDiscordConfig,
  updateDiscordConfig,
  getNewsGlobalKeywords,
} from "~/lib/config.server";
export async function maskedDiscordConfig() {
  const { botToken } = await getDiscordConfig();
  return {
    botTokenConfigured: Boolean(botToken),
    botTokenMasked: botToken
      ? botToken.length > 8
        ? `••••${botToken.slice(-4)}`
        : "Configured"
      : "",
  };
}
export const configOperations = {
  siteConfigSave: defineOperation({
    name: "siteConfigSave",
    area: "config",
    risk: "destructive",
    access: "admin",
    summary: "Save supplied site settings.",
    description:
      "Atomically patch supplied section/comment flags, global news keywords and the Discord token. Omitted fields keep their current values; null clears keywords or the token. Return only masked Discord configuration. Prefer siteSectionVisibilitySet, siteCommentVisibilitySet or newsGlobalKeywordsSet for a single change. Requires confirm: true.",
    input: siteConfigSaveInput,
    output: siteConfigOutput,
    examples: [{ title: "Hide jobs", input: { sections: { jobs: false }, confirm: true } }],
    run: async (_ctx, input) => {
      saveSiteConfig(input);
      const [sections, comments, newsGlobalKeywords, discord] = await Promise.all([
        getSectionVisibility(),
        getCommentVisibility(),
        getNewsGlobalKeywords(),
        maskedDiscordConfig(),
      ]);
      return { sections, comments, newsGlobalKeywords, discord };
    },
  }),
  siteConfigGet: defineOperation({
    name: "siteConfigGet",
    area: "config",
    risk: "read",
    access: "admin",
    summary: "Get site visibility and configuration.",
    description:
      "Return section/comment visibility and global news keywords. Discord credentials are masked and never returned in full.",
    input: emptyInput,
    output: siteConfigOutput,
    examples: [{ title: "Site settings", input: {} }],
    run: async () => {
      const [sections, comments, newsGlobalKeywords, discord] = await Promise.all([
        getSectionVisibility(),
        getCommentVisibility(),
        getNewsGlobalKeywords(),
        maskedDiscordConfig(),
      ]);
      return { sections, comments, newsGlobalKeywords, discord };
    },
  }),
  siteSectionVisibilitySet: defineOperation({
    name: "siteSectionVisibilitySet",
    area: "config",
    risk: "destructive",
    access: "admin",
    summary: "Change public section visibility.",
    description:
      "Patch supplied section flags. False hides that section's public content without deleting it. Requires confirm: true.",
    input: sectionVisibilityInput,
    output: sectionVisibility,
    examples: [{ title: "Hide jobs", input: { values: { jobs: false }, confirm: true } }],
    run: async (_ctx, { values }) => {
      await updateSectionVisibility(values);
      return getSectionVisibility();
    },
  }),
  siteCommentVisibilitySet: defineOperation({
    name: "siteCommentVisibilitySet",
    area: "config",
    risk: "destructive",
    access: "admin",
    summary: "Change comment visibility by content type.",
    description: "Patch supplied comment flags without deleting comments. Requires confirm: true.",
    input: commentVisibilityInput,
    output: commentVisibility,
    examples: [
      { title: "Hide company comments", input: { values: { companies: false }, confirm: true } },
    ],
    run: async (_ctx, { values }) => {
      await updateCommentVisibility(values);
      return getCommentVisibility();
    },
  }),
  discordConfigGet: defineOperation({
    name: "discordConfigGet",
    area: "discord",
    risk: "read",
    access: "admin",
    summary: "Get masked Discord configuration.",
    description:
      "Report whether a bot token is configured and its masked suffix. The credential itself is never returned.",
    input: emptyInput,
    output: discordConfigOutput,
    examples: [{ title: "Discord settings", input: {} }],
    run: () => maskedDiscordConfig(),
  }),
  discordConfigSet: defineOperation({
    name: "discordConfigSet",
    area: "discord",
    risk: "write",
    access: "admin",
    summary: "Replace the Discord bot token.",
    description:
      "Store the supplied token, or clear it with null. Return only masked configuration. Does not contact Discord.",
    input: discordConfigSetInput,
    output: discordConfigOutput,
    examples: [{ title: "Clear token", input: { botToken: null } }],
    run: async (_ctx, { botToken }) => {
      await updateDiscordConfig({ botToken: botToken ?? "" });
      return maskedDiscordConfig();
    },
  }),
};
