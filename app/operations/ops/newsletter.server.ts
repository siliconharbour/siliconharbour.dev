import { z } from "zod";
import { defineOperation } from "../define";
import { ConflictError, InvalidOperationError } from "../errors";
import { emptyInput, id, confirm, deleteInput } from "../fields";
import {
  newsletterFlags,
  newsletterSettingsInput,
  campaignOutput,
  campaignInput,
  campaignSaveInput,
  campaignGetInput,
  campaignGetOutput,
  subscriberOutput,
  subscriberListInput,
  subscriberCreateInput,
  subscriberResendInput,
} from "../contracts/newsletter";
import {
  getNewsletterFlags,
  setNewsletterFlags,
  getNewsletterList,
  getNewsletterCampaigns,
  getNewsletterCampaign,
  getNewsletterPreview,
  getNewsletterSends,
  getConfirmedPilotSubscriberIds,
  saveNewsletterCampaign,
  sendNewsletterTest,
  sendNewsletterLive,
  getNewsletterSubscribers,
  subscribeToNewsletter,
  unsubscribeFromNewsletter,
  pilotEmails,
  pilotProviderLabel,
} from "~/lib/newsletter.server";
import { getTurnstileSiteKey, isTurnstileEnabled } from "~/lib/turnstile.server";
async function assertSignupAllowed(email: string) {
  const flags = await getNewsletterFlags();
  if (
    !flags.publicSignup &&
    process.env.NODE_ENV === "production" &&
    !pilotEmails().includes(email)
  )
    throw new ConflictError(
      "Only configured pilot addresses can be added while public signup is off.",
    );
}
export const newsletterOperations = {
  newsletterCampaignList: defineOperation({
    name: "newsletterCampaignList",
    area: "newsletter",
    risk: "read",
    access: "admin",
    summary: "List newsletter campaigns.",
    description:
      "Read campaigns belonging to the configured Silicon Harbour list through the lists API. Subscriber and campaign data remain administrator-only.",
    input: emptyInput,
    output: z.array(campaignOutput),
    examples: [{ title: "Campaigns", input: {} }],
    run: async () => getNewsletterCampaigns((await getNewsletterList()).id),
  }),
  newsletterCampaignGet: defineOperation({
    name: "newsletterCampaignGet",
    area: "newsletter",
    risk: "read",
    access: "admin",
    summary: "Get a campaign, preview, and delivery history.",
    description:
      "Verify list ownership and return the campaign, rendered preview, rollout flags, confirmed pilot count, and 50 send records starting at offset.",
    input: campaignGetInput,
    output: campaignGetOutput,
    examples: [{ title: "Campaign details", input: { id: 1 } }],
    run: async (_ctx, { id, offset }) => {
      const list = await getNewsletterList();
      const campaign = await getNewsletterCampaign(id, list.id);
      const [preview, flags, pilotIds, sends] = await Promise.all([
        getNewsletterPreview(id),
        getNewsletterFlags(),
        getConfirmedPilotSubscriberIds(list.id),
        getNewsletterSends(id, offset),
      ]);
      return { campaign, preview, flags, pilotCount: pilotIds.length, sends };
    },
  }),
  newsletterCampaignCreate: defineOperation({
    name: "newsletterCampaignCreate",
    area: "newsletter",
    risk: "write",
    access: "admin",
    summary: "Create a newsletter draft.",
    description:
      "Create a campaign for the configured list using the site's sender defaults. Does not send email.",
    input: campaignInput,
    output: campaignOutput,
    examples: [
      { title: "Draft", input: { subject: "Harbour news", bodyMarkdown: "Community updates" } },
    ],
    run: async (_ctx, input) => saveNewsletterCampaign((await getNewsletterList()).id, input),
  }),
  newsletterCampaignSave: defineOperation({
    name: "newsletterCampaignSave",
    area: "newsletter",
    risk: "write",
    access: "admin",
    summary: "Save a newsletter draft.",
    description:
      "Require a draft owned by the configured list. Replace subject and Markdown body without sending it.",
    input: campaignSaveInput,
    output: campaignOutput,
    examples: [
      {
        title: "Save draft",
        input: { id: 1, subject: "Harbour news", bodyMarkdown: "Community updates" },
      },
    ],
    run: async (_ctx, { id, ...fields }) => {
      const list = await getNewsletterList();
      const campaign = await getNewsletterCampaign(id, list.id);
      if (campaign.status !== "draft") throw new ConflictError("Only drafts can be edited.");
      return saveNewsletterCampaign(list.id, fields, id);
    },
  }),
  newsletterCampaignSendTest: defineOperation({
    name: "newsletterCampaignSendTest",
    area: "newsletter",
    risk: "external",
    access: "admin",
    summary: "Send a newsletter to confirmed pilot subscribers.",
    description:
      "Verify list ownership and send the campaign to configured, confirmed pilot addresses only. Requires confirm: true. Full-list liveSend need not be enabled.",
    input: z.object({ id: id(), confirm }).strict(),
    output: campaignOutput,
    examples: [{ title: "Pilot send", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id }) => sendNewsletterTest(id, (await getNewsletterList()).id),
  }),
  newsletterCampaignSendLive: defineOperation({
    name: "newsletterCampaignSendLive",
    area: "newsletter",
    risk: "external",
    access: "admin",
    summary: "Send a newsletter to the confirmed list.",
    description:
      "Verify campaign ownership and require the liveSend rollout flag. This sends real email to the full confirmed audience. Requires confirm: true.",
    input: z
      .object({
        id: id(),
        confirm,
        confirmationSubject: z
          .string()
          .max(255)
          .optional()
          .describe("If supplied, must exactly match the campaign subject."),
      })
      .strict(),
    output: campaignOutput,
    examples: [{ title: "Live send", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id, confirmationSubject }) => {
      if (!(await getNewsletterFlags()).liveSend)
        throw new ConflictError("Full-list sending is disabled in newsletter settings.");
      const list = await getNewsletterList();
      if (confirmationSubject !== undefined) {
        const campaign = await getNewsletterCampaign(id, list.id);
        if (confirmationSubject !== campaign.subject)
          throw new ConflictError("Enter the exact campaign subject to confirm.");
      }
      return sendNewsletterLive(id, list.id);
    },
  }),
  newsletterSubscriberList: defineOperation({
    name: "newsletterSubscriberList",
    area: "newsletter",
    risk: "read",
    access: "admin",
    summary: "List newsletter subscribers.",
    description:
      "Search the configured list and return up to 50 subscribers starting at offset. Email addresses and membership status are administrator-only.",
    input: subscriberListInput,
    output: z.array(subscriberOutput),
    examples: [{ title: "Subscribers", input: {} }],
    run: async (_ctx, input) =>
      (
        await getNewsletterSubscribers((await getNewsletterList()).id, input.search, input.offset)
      ).slice(0, input.limit),
  }),
  newsletterSubscriberCreate: defineOperation({
    name: "newsletterSubscriberCreate",
    area: "newsletter",
    risk: "external",
    access: "admin",
    summary: "Add a subscriber and request confirmation.",
    description:
      "Respect the production signup rollout: when disabled, only configured pilot addresses may be added. Send a subscription confirmation email. Requires confirm: true.",
    input: subscriberCreateInput,
    output: z.object({ id: z.number(), email: z.string() }).strict(),
    examples: [{ title: "Add subscriber", input: { email: "reader@example.com", confirm: true } }],
    run: async (_ctx, input) => {
      await assertSignupAllowed(input.email);
      return subscribeToNewsletter(
        input.email,
        input.firstName ?? undefined,
        input.lastName ?? undefined,
      );
    },
  }),
  newsletterSubscriberResendConfirmation: defineOperation({
    name: "newsletterSubscriberResendConfirmation",
    area: "newsletter",
    risk: "external",
    access: "admin",
    summary: "Resend a subscription confirmation.",
    description:
      "Require an active, unconfirmed member of the configured list and respect the production signup rollout. Requires confirm: true.",
    input: subscriberResendInput,
    output: z.object({ id: z.number(), email: z.string() }).strict(),
    examples: [
      { title: "Resend confirmation", input: { email: "reader@example.com", confirm: true } },
    ],
    run: async (_ctx, { email }) => {
      await assertSignupAllowed(email);
      const list = await getNewsletterList();
      const member = (await getNewsletterSubscribers(list.id, email)).find(
        (row) => row.email.toLowerCase() === email,
      );
      if (!member || member.status !== "active" || member.membershipStatus !== "unconfirmed")
        throw new ConflictError(
          "Only active, unconfirmed subscribers can be sent another confirmation.",
        );
      return subscribeToNewsletter(email);
    },
  }),
  newsletterSubscriberUnsubscribe: defineOperation({
    name: "newsletterSubscriberUnsubscribe",
    area: "newsletter",
    risk: "destructive",
    access: "admin",
    summary: "Unsubscribe a list member.",
    description:
      "Remove the member from the configured list using the lists API. Requires confirm: true.",
    input: deleteInput,
    output: z
      .object({ id: z.number(), listId: z.number(), status: z.literal("unsubscribed") })
      .strict(),
    examples: [{ title: "Unsubscribe", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id }) => unsubscribeFromNewsletter(id, (await getNewsletterList()).id),
  }),
  newsletterPilotSubscribe: defineOperation({
    name: "newsletterPilotSubscribe",
    area: "newsletter",
    risk: "external",
    access: "admin",
    summary: "Request confirmation from configured pilot addresses.",
    description:
      "Skip confirmed or blocklisted pilot addresses, and send confirmations to the remaining configured pilots. Requires confirm: true.",
    input: z.object({ confirm }).strict(),
    output: z.object({ requested: z.number() }).strict(),
    examples: [{ title: "Invite pilots", input: { confirm: true } }],
    run: async () => {
      const emails = pilotEmails();
      if (!emails.length) throw new InvalidOperationError("No pilot addresses are configured.");
      const list = await getNewsletterList();
      let requested = 0;
      for (const email of emails) {
        const existing = (await getNewsletterSubscribers(list.id, email)).find(
          (row) => row.email.toLowerCase() === email,
        );
        if (existing?.status === "blocklisted" || existing?.membershipStatus === "confirmed")
          continue;
        await subscribeToNewsletter(email, "Jack", pilotProviderLabel(email));
        requested++;
      }
      if (!requested)
        throw new ConflictError("All pilot addresses are already confirmed or blocklisted.");
      return { requested };
    },
  }),
  newsletterSettingsGet: defineOperation({
    name: "newsletterSettingsGet",
    area: "newsletter",
    risk: "read",
    access: "admin",
    summary: "Get newsletter rollout flags.",
    description: "Return publicSignup and liveSend. Configuration credentials are never returned.",
    input: emptyInput,
    output: newsletterFlags,
    examples: [{ title: "Rollout flags", input: {} }],
    run: () => getNewsletterFlags(),
  }),
  newsletterSettingsSet: defineOperation({
    name: "newsletterSettingsSet",
    area: "newsletter",
    risk: "destructive",
    access: "admin",
    summary: "Change newsletter signup and live-send flags.",
    description:
      "Replace both rollout flags. Production public signup requires configured Turnstile keys. Enabling liveSend permits later full-list sends, but this operation sends no email. Requires confirm: true.",
    input: newsletterSettingsInput,
    output: newsletterFlags,
    examples: [
      {
        title: "Disable live sends",
        input: { publicSignup: false, liveSend: false, confirm: true },
      },
    ],
    run: async (_ctx, { publicSignup, liveSend }) => {
      if (
        publicSignup &&
        process.env.NODE_ENV === "production" &&
        (!getTurnstileSiteKey() || !isTurnstileEnabled())
      )
        throw new ConflictError(
          "Configure the Turnstile site and secret keys before opening public signup.",
        );
      await setNewsletterFlags({ publicSignup, liveSend });
      return { publicSignup, liveSend };
    },
  }),
};
