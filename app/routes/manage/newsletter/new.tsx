import type { Route } from "./+types/new";
import { Form, Link, redirect, useActionData } from "react-router";
import { z } from "zod";
import { requireAdmin } from "~/lib/session.server";
import { getNewsletterList, saveNewsletterCampaign } from "~/lib/newsletter.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New newsletter - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  await getNewsletterList();
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  try {
    const subject = z.string().trim().min(1).max(255).parse(form.get("subject"));
    const bodyMarkdown = z.string().trim().min(1).parse(form.get("bodyMarkdown"));
    const list = await getNewsletterList();
    const campaign = await saveNewsletterCampaign(list.id, { subject, bodyMarkdown });
    return redirect(`/manage/newsletter/${campaign.id}`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create campaign." };
  }
}

export default function NewNewsletterCampaign() {
  const actionData = useActionData<typeof action>();
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <Link to="/manage/newsletter" className="text-sm text-harbour-600 underline">&larr; Newsletter</Link>
      <h1 className="mt-4 text-2xl font-semibold text-harbour-700">New campaign</h1>
      <p className="mt-1 text-sm text-harbour-500">Write a digest in Markdown. Links to site content can be included in the body.</p>
      {actionData?.error && <p className="mt-4 border border-red-200 bg-red-50 p-3 text-red-700">{actionData.error}</p>}
      <Form method="post" className="mt-6 space-y-4">
        <label className="block text-sm font-medium text-harbour-700">Subject
          <input name="subject" required maxLength={255} className="mt-1 block w-full border border-harbour-200 p-2" />
        </label>
        <label className="block text-sm font-medium text-harbour-700">Body (Markdown)
          <textarea name="bodyMarkdown" required rows={18} className="mt-1 block w-full border border-harbour-200 p-2 font-mono text-sm" />
        </label>
        <button className="bg-harbour-600 px-4 py-2 font-medium text-white hover:bg-harbour-700">Save draft</button>
      </Form>
    </div>
  );
}
