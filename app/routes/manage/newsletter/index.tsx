import type { Route } from "./+types/index";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import { requireAdmin } from "~/lib/session.server";
import {
  getNewsletterCampaigns,
  getNewsletterFlags,
  getNewsletterList,
  getNewsletterStats,
  getNewsletterSubscribers,
  isNewsletterConfigured,
  pilotEmails,
  pilotProviderLabel,
  subscribeToNewsletter,
  unsubscribeFromNewsletter,
} from "~/lib/newsletter.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Newsletter - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const flags = await getNewsletterFlags();
  if (!isNewsletterConfigured()) return { configured: false as const, flags };
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().slice(0, 255) ?? "";
  const list = await getNewsletterList();
  const [stats, subscribers, campaigns] = await Promise.all([
    getNewsletterStats(list.id),
    getNewsletterSubscribers(list.id, search),
    getNewsletterCampaigns(list.id),
  ]);
  return {
    configured: true as const,
    flags,
    list,
    stats,
    subscribers,
    campaigns,
    search,
    pilotCount: pilotEmails().length,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  if (!isNewsletterConfigured()) return { error: "Lists is not configured." };
  const form = await request.formData();
  const intent = form.get("intent");
  const flags = await getNewsletterFlags();
  try {
    if (intent === "add-pilot") {
      const emails = pilotEmails();
      if (emails.length === 0) return { error: "No pilot addresses are configured." };
      for (const email of emails) await subscribeToNewsletter(email, "Jack", pilotProviderLabel(email));
      return redirect("/manage/newsletter?notice=pilot-added");
    }
    if (intent === "add" || intent === "resend") {
      const email = z.email().parse(form.get("email"));
      if (!flags.publicSignup && process.env.NODE_ENV === "production" && !pilotEmails().includes(email.toLowerCase()))
        return { error: "Only configured pilot addresses can be added while public signup is off." };
      const firstName = intent === "add" ? String(form.get("firstName") ?? "").trim().slice(0, 255) : undefined;
      const lastName = intent === "add" ? String(form.get("lastName") ?? "").trim().slice(0, 255) : undefined;
      await subscribeToNewsletter(email, firstName, lastName);
      return redirect("/manage/newsletter?notice=confirmation-requested");
    }
    if (intent === "unsubscribe") {
      const id = z.coerce.number().int().positive().parse(form.get("id"));
      const list = await getNewsletterList();
      await unsubscribeFromNewsletter(id, list.id);
      return redirect("/manage/newsletter?notice=unsubscribed");
    }
    return { error: "Unknown newsletter action." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Newsletter action failed." };
  }
}

const statusStyle = {
  confirmed: "bg-green-100 text-green-700",
  unconfirmed: "bg-amber-100 text-amber-700",
  unsubscribed: "bg-harbour-100 text-harbour-600",
} as const;

export default function NewsletterIndex() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Link to="/manage" className="text-sm text-harbour-500 hover:text-harbour-700">
          &larr; Back to Dashboard
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-harbour-700">Newsletter</h1>
            <p className="mt-1 text-sm text-harbour-500">Campaigns and subscribers are stored in Lists.</p>
          </div>
          {data.configured && (
            <Link to="/manage/newsletter/new" className="bg-harbour-600 px-3 py-2 text-sm font-medium text-white hover:bg-harbour-700">
              New campaign
            </Link>
          )}
        </div>

        {actionData?.error && <p className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionData.error}</p>}
        {!data.configured ? (
          <p className="border border-amber-200 bg-amber-50 p-4 text-amber-700">
            Set LISTS_API_URL and LISTS_API_TOKEN on the server to connect the newsletter.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Confirmed" value={data.stats.confirmed} />
              <Stat label="Awaiting confirmation" value={data.stats.unconfirmed} />
              <Stat label="Unsubscribed" value={data.stats.unsubscribed} />
            </div>
            <div className="border border-harbour-200 bg-white p-4 text-sm text-harbour-600">
              <p>Public signup: <strong>{data.flags.publicSignup ? "On" : "Off"}</strong> · Full-list sending: <strong>{data.flags.liveSend ? "On" : "Off"}</strong></p>
              <Link to="/manage/newsletter/settings" className="mt-2 inline-block text-harbour-600 underline">Change rollout settings</Link>
            </div>

            <section className="border border-harbour-200 bg-white">
              <div className="border-b border-harbour-200 bg-harbour-50 p-4">
                <h2 className="font-semibold text-harbour-700">Campaigns</h2>
              </div>
              {data.campaigns.length === 0 ? (
                <p className="p-4 text-sm text-harbour-500">No campaigns yet.</p>
              ) : (
                <div className="divide-y divide-harbour-100">
                  {data.campaigns.map((campaign) => (
                    <Link key={campaign.id} to={`/manage/newsletter/${campaign.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-harbour-50">
                      <span className="font-medium text-harbour-700">{campaign.subject}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-600">{campaign.status}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="border border-harbour-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-harbour-200 bg-harbour-50 p-4">
                <h2 className="font-semibold text-harbour-700">Subscribers</h2>
                <Form method="get" className="flex gap-2">
                  <input name="search" defaultValue={data.search} placeholder="Search email" className="border border-harbour-200 px-2 py-1 text-sm" />
                  <button className="bg-harbour-600 px-2 py-1 text-sm text-white">Search</button>
                </Form>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-harbour-50 text-harbour-700"><tr><th className="px-4 py-2">Email</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Actions</th></tr></thead>
                  <tbody className="divide-y divide-harbour-100">
                    {data.subscribers.map((subscriber) => (
                      <tr key={subscriber.id}>
                        <td className="px-4 py-2 text-harbour-700">{subscriber.email}</td>
                        <td className="px-4 py-2">{[subscriber.firstName, subscriber.lastName].filter(Boolean).join(" ")}</td>
                        <td className="px-4 py-2"><span className={`text-xs px-1.5 py-0.5 ${statusStyle[subscriber.membershipStatus ?? "unsubscribed"]}`}>{subscriber.membershipStatus}</span></td>
                        <td className="flex flex-wrap gap-2 px-4 py-2">
                          {subscriber.membershipStatus === "unconfirmed" && <Form method="post"><input type="hidden" name="intent" value="resend" /><input type="hidden" name="email" value={subscriber.email} /><button className="text-harbour-600 underline">Resend confirmation</button></Form>}
                          {subscriber.membershipStatus !== "unsubscribed" && <Form method="post"><input type="hidden" name="intent" value="unsubscribe" /><input type="hidden" name="id" value={subscriber.id} /><button className="text-red-700 underline">Unsubscribe</button></Form>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.subscribers.length === 0 && <p className="p-4 text-sm text-harbour-500">No subscribers found.</p>}
            </section>

            <section className="border border-harbour-200 bg-white p-4">
              <h2 className="font-semibold text-harbour-700">Add a subscriber</h2>
              <p className="mt-1 text-sm text-harbour-500">Lists sends a confirmation email. The address receives campaigns only after confirmation.</p>
              <Form method="post" className="mt-4 flex flex-wrap gap-2">
                <input type="hidden" name="intent" value="add" />
                <input type="email" name="email" required placeholder="Email address" className="border border-harbour-200 px-3 py-2 text-sm" />
                <input name="firstName" placeholder="First name" className="border border-harbour-200 px-3 py-2 text-sm" />
                <input name="lastName" placeholder="Last name" className="border border-harbour-200 px-3 py-2 text-sm" />
                <button className="bg-harbour-600 px-3 py-2 text-sm font-medium text-white">Send confirmation</button>
              </Form>
              {data.pilotCount > 0 && <Form method="post" className="mt-4"><input type="hidden" name="intent" value="add-pilot" /><button className="text-sm text-harbour-600 underline">Send confirmation to {data.pilotCount} pilot addresses</button></Form>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="border border-harbour-200 bg-white p-4"><p className="text-sm text-harbour-500">{label}</p><p className="mt-1 text-2xl font-semibold text-harbour-700">{value}</p></div>;
}
