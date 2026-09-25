import type { Route } from "./+types/subscribers";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import { requireAdmin } from "~/lib/session.server";
import { getNewsletterFlags, getNewsletterList, getNewsletterSubscribers, pilotEmails, subscribeToNewsletter, unsubscribeFromNewsletter } from "~/lib/newsletter.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Newsletter subscribers - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().slice(0, 255) ?? "";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const list = await getNewsletterList();
  return { subscribers: await getNewsletterSubscribers(list.id, search, (page - 1) * 50), search, page, notice: url.searchParams.get("notice") };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  try {
    const list = await getNewsletterList();
    const intent = form.get("intent");
    if (intent === "resend") {
      const email = z.email().parse(form.get("email"));
      const flags = await getNewsletterFlags();
      if (!flags.publicSignup && process.env.NODE_ENV === "production" && !pilotEmails().includes(email.toLowerCase()))
        return { error: "Only configured pilot addresses can be sent confirmation while public signup is off." };
      const matches = await getNewsletterSubscribers(list.id, email);
      const subscriber = matches.find((item) => item.email.toLowerCase() === email.toLowerCase());
      if (!subscriber || subscriber.status !== "active" || subscriber.membershipStatus !== "unconfirmed")
        return { error: "Only active, unconfirmed subscribers can be sent another confirmation." };
      await subscribeToNewsletter(email);
      return redirect("/manage/newsletter/subscribers?notice=confirmation-requested");
    }
    if (intent === "unsubscribe") {
      const id = z.coerce.number().int().positive().parse(form.get("id"));
      await unsubscribeFromNewsletter(id, list.id);
      return redirect("/manage/newsletter/subscribers?notice=unsubscribed");
    }
    return { error: "Unknown subscriber action." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Subscriber action failed." };
  }
}

const statusStyle = {
  confirmed: "bg-green-100 text-green-700",
  unconfirmed: "bg-amber-100 text-amber-700",
  unsubscribed: "bg-harbour-100 text-harbour-600",
  blocklisted: "bg-red-100 text-red-700",
} as const;

export default function NewsletterSubscribers() {
  const { subscribers, search, page, notice } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return <div className="mx-auto max-w-5xl p-4 md:p-6">
    <Link to="/manage/newsletter" className="text-sm text-harbour-600 underline">&larr; Newsletter</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold text-harbour-700">Subscribers</h1><p className="mt-1 text-sm text-harbour-500">Membership and delivery eligibility come from Lists.</p></div><Link to="/manage/newsletter/subscribers/new" className="bg-harbour-600 px-3 py-2 text-sm font-medium text-white hover:bg-harbour-700">Add subscriber</Link></div>
    {actionData?.error && <p className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionData.error}</p>}
    {notice && <p className="mt-4 border border-green-200 bg-green-50 p-3 text-sm text-green-700">{notice === "unsubscribed" ? "Subscriber unsubscribed." : "Confirmation requested."}</p>}
    <Form method="get" className="mt-6 flex flex-wrap gap-2"><input name="search" defaultValue={search} placeholder="Search email" className="min-w-64 border border-harbour-200 px-3 py-2 text-sm" /><button className="bg-harbour-600 px-3 py-2 text-sm text-white">Search</button></Form>
    <div className="mt-4 overflow-x-auto border border-harbour-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-harbour-50 text-harbour-700"><tr><th className="px-4 py-3">Email</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-harbour-100">
      {subscribers.map((subscriber) => {
        const status = subscriber.status === "blocklisted" ? "blocklisted" : subscriber.membershipStatus ?? "unsubscribed";
        return <tr key={subscriber.id}><td className="px-4 py-3 font-medium text-harbour-700">{subscriber.email}</td><td className="px-4 py-3 text-harbour-600">{[subscriber.firstName, subscriber.lastName].filter(Boolean).join(" ") || "—"}</td><td className="px-4 py-3"><span className={`px-1.5 py-0.5 text-xs ${statusStyle[status]}`}>{status}</span></td><td className="flex flex-wrap gap-3 px-4 py-3">{status === "unconfirmed" && <Form method="post"><input type="hidden" name="intent" value="resend" /><input type="hidden" name="email" value={subscriber.email} /><button className="text-harbour-600 underline">Resend confirmation</button></Form>}{status !== "unsubscribed" && <Form method="post"><input type="hidden" name="intent" value="unsubscribe" /><input type="hidden" name="id" value={subscriber.id} /><button className="text-red-700 underline">Unsubscribe</button></Form>}</td></tr>;
      })}
    </tbody></table>{subscribers.length === 0 && <p className="p-4 text-sm text-harbour-500">No subscribers found.</p>}</div>
    <div className="mt-4 flex gap-4 text-sm">{page > 1 && <Link to={`?search=${encodeURIComponent(search)}&page=${page - 1}`} className="text-harbour-600 underline">Previous</Link>}{subscribers.length === 50 && <Link to={`?search=${encodeURIComponent(search)}&page=${page + 1}`} className="text-harbour-600 underline">Next</Link>}</div>
  </div>;
}
