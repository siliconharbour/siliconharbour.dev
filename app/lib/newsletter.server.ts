import { createHash } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "~/db";
import { siteConfig } from "~/db/schema";

type ListsResponse<T> = { data: T };

export type MailingList = {
  id: number;
  slug: string;
  name: string;
  fromDomain: string;
  fromAddress: string;
};

export type Subscriber = {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: "active" | "blocklisted";
  membershipStatus: "unconfirmed" | "confirmed" | "unsubscribed" | null;
};

export type Campaign = {
  id: number;
  subject: string;
  bodyMarkdown: string;
  fromAddress: string;
  fromName: string | null;
  audienceType: "list" | "tag" | "all" | "subscribers";
  audienceId: number | null;
  audienceData: string | null;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  createdAt: string;
  sentAt: string | null;
  lastError: string | null;
  deliveryCounts?: Record<string, number>;
};

export type CampaignSend = {
  id: number;
  subscriberId: number;
  email: string | null;
  status: string;
  attemptCount: number;
  acceptedAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
};

export type ListStats = { listId: number; confirmed: number; unconfirmed: number; unsubscribed: number };
export type CampaignPreview = { subject: string; html: string | null; text: string };

const PUBLIC_SIGNUP_KEY = "newsletter_public_signup_enabled";
const LIVE_SEND_KEY = "newsletter_live_send_enabled";

export function isNewsletterConfigured() {
  return Boolean(process.env.LISTS_API_URL && process.env.LISTS_API_TOKEN);
}

export function pilotEmails() {
  return [...new Set((process.env.LISTS_PILOT_EMAILS ?? "")
    .split(/[\s,]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean))];
}

export function pilotProviderLabel(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  const labels: Record<string, string> = {
    "jackharrhy.com": "Personal",
    "gndctl.com": "GNDCTL",
    "gmail.com": "Gmail",
    "hotmail.com": "Hotmail",
    "mun.ca": "MUN",
  };
  return labels[domain ?? ""] ?? domain ?? "Pilot";
}

export function newsletterSender() {
  return {
    fromAddress: process.env.LISTS_FROM_ADDRESS ?? "hello@siliconharbour.dev",
    fromName: "Silicon Harbour",
  };
}

export function hashNewsletterEmail(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export async function getNewsletterFlags() {
  const rows = await db
    .select()
    .from(siteConfig)
    .where(inArray(siteConfig.key, [PUBLIC_SIGNUP_KEY, LIVE_SEND_KEY]))
    .all();
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    publicSignup: values.get(PUBLIC_SIGNUP_KEY) === "true",
    liveSend: values.get(LIVE_SEND_KEY) === "true",
  };
}

export async function setNewsletterFlags(flags: { publicSignup: boolean; liveSend: boolean }) {
  db.transaction((tx) => {
    for (const [key, value] of [
      [PUBLIC_SIGNUP_KEY, flags.publicSignup],
      [LIVE_SEND_KEY, flags.liveSend],
    ] as const) {
      tx
        .insert(siteConfig)
        .values({ key, value: String(value) })
        .onConflictDoUpdate({ target: siteConfig.key, set: { value: String(value), updatedAt: new Date() } })
        .run();
    }
  });
}

async function listsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = process.env.LISTS_API_URL;
  const token = process.env.LISTS_API_TOKEN;
  if (!baseUrl || !token) throw new Error("Lists is not configured");
  const response = await fetch(new URL(`/api/v1${path}`, baseUrl), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as ListsResponse<T> | { error?: string } | null;
  if (!response.ok || !body || !("data" in body)) {
    const detail = body && "error" in body ? body.error : undefined;
    throw new Error(`Lists request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return body.data;
}

export async function getNewsletterList() {
  const lists = await listsRequest<MailingList[]>("/lists");
  const slug = process.env.LISTS_LIST_SLUG ?? "siliconharbour";
  const list = lists.find((item) => item.slug === slug);
  if (!list) throw new Error(`Lists mailing list '${slug}' was not found`);
  return list;
}

export async function getNewsletterStats(listId: number) {
  return listsRequest<ListStats>(`/lists/${listId}/stats`);
}

export async function getNewsletterSubscribers(listId: number, search = "", offset = 0) {
  const params = new URLSearchParams({ listId: String(listId), limit: "50", offset: String(offset) });
  if (search) params.set("search", search);
  return listsRequest<Subscriber[]>(`/subscribers?${params}`);
}

export async function subscribeToNewsletter(email: string, firstName?: string, lastName?: string) {
  const list = await getNewsletterList();
  return listsRequest<{ id: number; email: string }>("/subscribers", {
    method: "POST",
    body: JSON.stringify({
      email,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      lists: [list.slug],
      sendConfirmation: true,
    }),
  });
}

export async function unsubscribeFromNewsletter(id: number, listId: number) {
  return listsRequest<{ id: number; listId: number; status: "unsubscribed" }>(
    `/subscribers/${id}/unsubscribe`,
    { method: "POST", body: JSON.stringify({ listId, confirm: true }) },
  );
}

export async function getNewsletterCampaigns(listId: number) {
  const campaigns = await listsRequest<Campaign[]>("/campaigns?limit=200");
  return campaigns.filter((campaign) => campaign.audienceType === "list" && campaign.audienceId === listId);
}

export async function getNewsletterCampaign(id: number, listId: number) {
  const campaign = await listsRequest<Campaign>(`/campaigns/${id}`);
  if (campaign.audienceType !== "list" || campaign.audienceId !== listId)
    throw new Error("Campaign does not belong to the Silicon Harbour list");
  return campaign;
}

export async function getNewsletterSends(id: number, offset = 0) {
  const params = new URLSearchParams({ limit: "50", offset: String(offset) });
  return listsRequest<CampaignSend[]>(`/campaigns/${id}/sends?${params}`);
}

export async function getNewsletterPreview(id: number) {
  return listsRequest<CampaignPreview>(`/campaigns/${id}/preview`);
}

export async function saveNewsletterCampaign(
  listId: number,
  values: { subject: string; bodyMarkdown: string },
  id?: number,
) {
  return listsRequest<Campaign>(id ? `/campaigns/${id}` : "/campaigns", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify({
      ...values,
      ...newsletterSender(),
      audienceType: "list",
      audienceId: listId,
      templateSlug: "newsletter",
    }),
  });
}

export async function getConfirmedPilotSubscriberIds(listId: number) {
  const ids: number[] = [];
  for (const email of pilotEmails()) {
    const subscribers = await getNewsletterSubscribers(listId, email);
    const subscriber = subscribers.find((item) => item.email.toLowerCase() === email);
    if (subscriber?.status === "active" && subscriber.membershipStatus === "confirmed") ids.push(subscriber.id);
  }
  return ids;
}

export async function sendNewsletterTest(id: number, listId: number) {
  await getNewsletterCampaign(id, listId);
  const subscriberIds = await getConfirmedPilotSubscriberIds(listId);
  if (subscriberIds.length === 0) throw new Error("No pilot addresses have confirmed their subscriptions yet");
  return listsRequest<Campaign>(`/campaigns/${id}/test-send`, {
    method: "POST",
    body: JSON.stringify({ subscriberIds, confirm: true }),
  });
}

export async function sendNewsletterLive(id: number, listId: number) {
  await getNewsletterCampaign(id, listId);
  return listsRequest<Campaign>(`/campaigns/${id}/send`, {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
}
