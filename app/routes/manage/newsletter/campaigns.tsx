import type { Route } from "./+types/campaigns";
import { Link, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getNewsletterCampaigns, getNewsletterList } from "~/lib/newsletter.server";
import { newsletterAudience } from "~/lib/newsletter-audience";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Newsletter campaigns - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const list = await getNewsletterList();
  return { campaigns: await getNewsletterCampaigns(list.id) };
}

export default function NewsletterCampaigns() {
  const { campaigns } = useLoaderData<typeof loader>();
  return <div className="mx-auto max-w-5xl p-4 md:p-6">
    <Link to="/manage/newsletter" className="text-sm text-harbour-600 underline">&larr; Newsletter</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold text-harbour-700">Campaigns</h1><p className="mt-1 text-sm text-harbour-500">Drafts, pilot tests, and sent newsletters.</p></div><Link to="/manage/newsletter/new" className="bg-harbour-600 px-3 py-2 text-sm font-medium text-white hover:bg-harbour-700">New campaign</Link></div>
    <div className="mt-6 overflow-x-auto border border-harbour-200 bg-white">
      <table className="w-full text-left text-sm"><thead className="bg-harbour-50 text-harbour-700"><tr><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Audience</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Sent</th></tr></thead><tbody className="divide-y divide-harbour-100">
        {campaigns.map((campaign) => <tr key={campaign.id}><td className="px-4 py-3"><Link to={`/manage/newsletter/${campaign.id}`} className="font-medium text-harbour-700 underline hover:text-harbour-600">{campaign.subject}</Link></td><td className="px-4 py-3 text-harbour-600">{newsletterAudience(campaign).label}</td><td className="px-4 py-3"><span className="bg-harbour-100 px-1.5 py-0.5 text-xs text-harbour-600">{campaign.status}</span></td><td className="px-4 py-3 text-harbour-500">{campaign.sentAt ? new Date(campaign.sentAt).toLocaleDateString() : "—"}</td></tr>)}
      </tbody></table>
      {campaigns.length === 0 && <p className="p-4 text-sm text-harbour-500">No campaigns yet.</p>}
    </div>
  </div>;
}
