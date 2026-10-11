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
  return <div className="mx-auto max-w-5xl p-pad-4 md:p-pad-6">
    <Link to="/manage/newsletter" className="text-sm text-body underline">&larr; Newsletter</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-gap-3"><div><h1 className="text-2xl font-semibold text-heading">Campaigns</h1><p className="mt-1 text-sm text-muted">Drafts, pilot tests, and sent newsletters.</p></div><Link to="/manage/newsletter/new" className="bg-primary px-pad-3 py-pad-2 text-sm font-medium text-white hover:bg-primary-hover">New campaign</Link></div>
    <div className="mt-6 overflow-x-auto border border-line bg-surface rounded-panel">
      <table className="w-full text-left text-sm"><thead className="bg-soft text-heading"><tr><th className="px-pad-4 py-pad-3">Subject</th><th className="px-pad-4 py-pad-3">Audience</th><th className="px-pad-4 py-pad-3">Status</th><th className="px-pad-4 py-pad-3">Sent</th></tr></thead><tbody className="divide-y divide-harbour-100">
        {campaigns.map((campaign) => <tr key={campaign.id}><td className="px-pad-4 py-pad-3"><Link to={`/manage/newsletter/${campaign.id}`} className="font-medium text-heading underline hover:text-body">{campaign.subject}</Link></td><td className="px-pad-4 py-pad-3 text-body">{newsletterAudience(campaign).label}</td><td className="px-pad-4 py-pad-3"><span className="bg-tint px-pad-1-5 py-pad-0-5 text-xs text-body">{campaign.status}</span></td><td className="px-pad-4 py-pad-3 text-muted">{campaign.sentAt ? new Date(campaign.sentAt).toLocaleDateString() : "—"}</td></tr>)}
      </tbody></table>
      {campaigns.length === 0 && <p className="p-pad-4 text-sm text-muted">No campaigns yet.</p>}
    </div>
  </div>;
}
