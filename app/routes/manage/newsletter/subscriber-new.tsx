import type { Route } from "./+types/subscriber-new";
import { Form, Link, redirect, useActionData } from "react-router";
import { z } from "zod";
import { requireAdmin } from "~/lib/session.server";
import { getNewsletterFlags, getNewsletterList, getNewsletterSubscribers, pilotEmails, pilotProviderLabel, subscribeToNewsletter } from "~/lib/newsletter.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Add newsletter subscriber - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  await getNewsletterList();
  return { pilotCount: pilotEmails().length };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  try {
    const flags = await getNewsletterFlags();
    if (form.get("intent") === "add-pilot") {
      const emails = pilotEmails();
      if (emails.length === 0) return { error: "No pilot addresses are configured." };
      const list = await getNewsletterList();
      let requested = 0;
      for (const email of emails) {
        const matches = await getNewsletterSubscribers(list.id, email);
        const existing = matches.find((item) => item.email.toLowerCase() === email);
        if (existing?.status === "blocklisted" || existing?.membershipStatus === "confirmed") continue;
        await subscribeToNewsletter(email, "Jack", pilotProviderLabel(email));
        requested++;
      }
      if (requested === 0) return { error: "All pilot addresses are already confirmed or blocklisted." };
      return redirect("/manage/newsletter/subscribers?notice=confirmation-requested");
    }
    if (form.get("intent") === "add") {
      const email = z.email().parse(form.get("email")).toLowerCase();
      if (!flags.publicSignup && process.env.NODE_ENV === "production" && !pilotEmails().includes(email))
        return { error: "Only configured pilot addresses can be added while public signup is off." };
      const firstName = String(form.get("firstName") ?? "").trim().slice(0, 255);
      const lastName = String(form.get("lastName") ?? "").trim().slice(0, 255);
      await subscribeToNewsletter(email, firstName, lastName);
      return redirect("/manage/newsletter/subscribers?notice=confirmation-requested");
    }
    return { error: "Unknown subscriber action." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Subscriber action failed." };
  }
}

export default function AddNewsletterSubscriber({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  return <div className="mx-auto max-w-3xl p-4 md:p-6">
    <Link to="/manage/newsletter/subscribers" className="text-sm text-harbour-600 underline">&larr; Subscribers</Link>
    <h1 className="mt-4 text-2xl font-semibold text-harbour-700">Add subscriber</h1>
    <p className="mt-1 text-sm text-harbour-500">Lists sends a confirmation email. An address receives campaigns only after confirmation.</p>
    {actionData?.error && <p className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionData.error}</p>}
    <Form method="post" className="mt-6 space-y-4 border border-harbour-200 bg-white p-4"><input type="hidden" name="intent" value="add" />
      <label className="block text-sm font-medium text-harbour-700">Email address<input type="email" name="email" required className="mt-1 block w-full border border-harbour-200 px-3 py-2" /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-harbour-700">First name<input name="firstName" className="mt-1 block w-full border border-harbour-200 px-3 py-2" /></label><label className="block text-sm font-medium text-harbour-700">Last name<input name="lastName" className="mt-1 block w-full border border-harbour-200 px-3 py-2" /></label></div>
      <button className="bg-harbour-600 px-4 py-2 text-sm font-medium text-white hover:bg-harbour-700">Send confirmation</button>
    </Form>
    {loaderData.pilotCount > 0 && <Form method="post" className="mt-6 border border-harbour-200 bg-harbour-50 p-4"><input type="hidden" name="intent" value="add-pilot" /><p className="text-sm text-harbour-600">Request confirmation for eligible pilot addresses that have not confirmed yet.</p><button className="mt-3 border border-harbour-200 bg-white px-3 py-2 text-sm font-medium text-harbour-700 hover:bg-harbour-100">Send to {loaderData.pilotCount} pilot addresses</button></Form>}
  </div>;
}
