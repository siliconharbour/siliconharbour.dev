import type { Route } from "./+types/detail";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import { requireAdmin } from "~/lib/session.server";
import {
  getConfirmedPilotSubscriberIds,
  getNewsletterCampaign,
  getNewsletterFlags,
  getNewsletterList,
  getNewsletterPreview,
  saveNewsletterCampaign,
  sendNewsletterLive,
  sendNewsletterTest,
} from "~/lib/newsletter.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Newsletter campaign - siliconharbour.dev" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const id = z.coerce.number().int().positive().parse(params.id);
  const list = await getNewsletterList();
  const [campaign, preview, flags, pilotIds] = await Promise.all([
    getNewsletterCampaign(id, list.id),
    getNewsletterPreview(id),
    getNewsletterFlags(),
    getConfirmedPilotSubscriberIds(list.id),
  ]);
  return { campaign, preview, flags, pilotCount: pilotIds.length };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  try {
    const id = z.coerce.number().int().positive().parse(params.id);
    const list = await getNewsletterList();
    const campaign = await getNewsletterCampaign(id, list.id);
    if (intent === "save") {
      if (campaign.status !== "draft") return { error: "Only drafts can be edited." };
      const subject = z.string().trim().min(1).max(255).parse(form.get("subject"));
      const bodyMarkdown = z.string().trim().min(1).parse(form.get("bodyMarkdown"));
      await saveNewsletterCampaign(list.id, { subject, bodyMarkdown }, id);
      return { success: "Draft saved." };
    }
    if (intent === "test-send") {
      if (form.get("confirm") !== "yes") return { error: "Confirm the pilot send first." };
      const result = await sendNewsletterTest(id, list.id);
      return { success: `Pilot send completed as campaign #${result.id}.` };
    }
    if (intent === "live-send") {
      const flags = await getNewsletterFlags();
      if (!flags.liveSend) return { error: "Full-list sending is disabled in newsletter settings." };
      if (form.get("confirm") !== campaign.subject) return { error: "Enter the exact campaign subject to confirm." };
      await sendNewsletterLive(id, list.id);
      return { success: "Campaign sent to the confirmed list." };
    }
    return { error: "Unknown campaign action." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Campaign action failed." };
  }
}

export default function NewsletterCampaignDetail() {
  const { campaign, preview, flags, pilotCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <Link to="/manage/newsletter" className="text-sm text-harbour-600 underline">&larr; Newsletter</Link>
      <div className="mt-4 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold text-harbour-700">{campaign.subject}</h1><span className="bg-harbour-100 px-1.5 py-0.5 text-xs text-harbour-600">{campaign.status}</span></div>
      {"error" in (actionData ?? {}) && <p className="mt-4 border border-red-200 bg-red-50 p-3 text-red-700">{actionData?.error}</p>}
      {"success" in (actionData ?? {}) && <p className="mt-4 border border-green-200 bg-green-50 p-3 text-green-700">{actionData?.success}</p>}
      {campaign.lastError && <p className="mt-4 border border-red-200 bg-red-50 p-3 text-red-700">{campaign.lastError}</p>}
      {campaign.status === "draft" && <Form method="post" className="mt-6 space-y-4 border border-harbour-200 p-4">
        <input type="hidden" name="intent" value="save" />
        <label className="block text-sm font-medium text-harbour-700">Subject<input name="subject" defaultValue={campaign.subject} required maxLength={255} className="mt-1 block w-full border border-harbour-200 p-2" /></label>
        <label className="block text-sm font-medium text-harbour-700">Body (Markdown)<textarea name="bodyMarkdown" defaultValue={campaign.bodyMarkdown} required rows={18} className="mt-1 block w-full border border-harbour-200 p-2 font-mono text-sm" /></label>
        <button className="bg-harbour-600 px-4 py-2 font-medium text-white">Save draft</button>
      </Form>}
      <section className="mt-6 border border-harbour-200"><h2 className="border-b border-harbour-200 bg-harbour-50 p-3 font-semibold text-harbour-700">Email preview</h2><div className="p-4"><p className="mb-3 text-sm text-harbour-500">Subject: {preview.subject}</p><iframe title="Newsletter preview" srcDoc={preview.html ?? `<pre>${preview.text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre>`} sandbox="" className="h-[600px] w-full border border-harbour-200" /></div></section>
      {campaign.status === "draft" && <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Form method="post" className="border border-harbour-200 p-4"><input type="hidden" name="intent" value="test-send" /><h2 className="font-semibold text-harbour-700">Pilot send</h2><p className="mt-1 text-sm text-harbour-500">Send only to {pilotCount} confirmed pilot {pilotCount === 1 ? "address" : "addresses"}. The draft remains editable.</p><label className="mt-4 block text-sm"><input type="checkbox" name="confirm" value="yes" required /> I reviewed the preview and recipients.</label><button disabled={pilotCount === 0} className="mt-3 bg-harbour-600 px-3 py-2 text-sm text-white disabled:opacity-50">Send pilot email</button></Form>
        <Form method="post" className="border border-harbour-200 p-4"><input type="hidden" name="intent" value="live-send" /><h2 className="font-semibold text-harbour-700">Full-list send</h2><p className="mt-1 text-sm text-harbour-500">This sends to every confirmed subscriber. Currently {flags.liveSend ? "enabled" : "disabled"}.</p><label className="mt-4 block text-sm">Type the exact subject to confirm<input name="confirm" autoComplete="off" required className="mt-1 block w-full border border-harbour-200 p-2" /></label><button disabled={!flags.liveSend} className="mt-3 bg-harbour-600 px-3 py-2 text-sm text-white disabled:opacity-50">Send to full list</button></Form>
      </div>}
    </div>
  );
}
