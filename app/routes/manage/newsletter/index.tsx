import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getNewsletterFlags, getNewsletterList, getNewsletterStats, isNewsletterConfigured } from "~/lib/newsletter.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Newsletter - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const flags = await getNewsletterFlags();
  if (!isNewsletterConfigured()) return { configured: false as const, flags };
  const list = await getNewsletterList();
  return { configured: true as const, flags, stats: await getNewsletterStats(list.id) };
}

const links = [
  { label: "Campaigns", href: "/manage/newsletter/campaigns" },
  { label: "New campaign", href: "/manage/newsletter/new" },
  { label: "Subscribers", href: "/manage/newsletter/subscribers" },
  { label: "Add subscriber", href: "/manage/newsletter/subscribers/new" },
  { label: "Rollout settings", href: "/manage/newsletter/settings" },
];

export default function NewsletterIndex() {
  const data = useLoaderData<typeof loader>();
  return <div className="min-h-screen p-4 md:p-6">
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link to="/manage" className="text-sm text-harbour-500 hover:text-harbour-700">&larr; Back to Dashboard</Link>
      <div><h1 className="text-2xl font-semibold text-harbour-700">Newsletter</h1><p className="mt-1 text-sm text-harbour-500">Campaigns and subscribers are stored in Lists.</p></div>
      {!data.configured ? <p className="border border-amber-200 bg-amber-50 p-4 text-amber-700">Set LISTS_API_URL and LISTS_API_TOKEN on the server to connect the newsletter.</p> : <>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Confirmed" value={data.stats.confirmed} />
          <Stat label="Awaiting confirmation" value={data.stats.unconfirmed} />
          <Stat label="Unsubscribed" value={data.stats.unsubscribed} />
        </div>
        <div className="border border-harbour-200 bg-white p-4 text-sm text-harbour-600">Public signup: <strong>{data.flags.publicSignup ? "On" : "Off"}</strong> · Full-list sending: <strong>{data.flags.liveSend ? "On" : "Off"}</strong></div>
        <nav aria-label="Newsletter management" className="border border-harbour-200 bg-white">
          <div className="border-b border-harbour-100 px-3 py-3 sm:flex sm:items-center"><h2 className="w-32 shrink-0 text-sm font-medium text-harbour-500">Manage</h2><div className="mt-2 flex flex-wrap gap-2 sm:mt-0">{links.map((item) => <Link key={item.href} to={item.href} className="border border-harbour-200 bg-white px-3 py-1.5 text-sm font-medium text-harbour-700 transition-colors hover:border-harbour-400 hover:bg-harbour-50">{item.label}</Link>)}</div></div>
        </nav>
      </>}
    </div>
  </div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="border border-harbour-200 bg-white p-4"><p className="text-sm text-harbour-500">{label}</p><p className="mt-1 text-2xl font-semibold text-harbour-700">{value}</p></div>;
}
