import type { Route } from "./+types/settings";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getNewsletterFlags, setNewsletterFlags } from "~/lib/newsletter.server";
import { getTurnstileSiteKey, isTurnstileEnabled } from "~/lib/turnstile.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Newsletter settings - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return { flags: await getNewsletterFlags(), signupVerificationReady: Boolean(getTurnstileSiteKey() && isTurnstileEnabled()) };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const flags = { publicSignup: form.get("publicSignup") === "on", liveSend: form.get("liveSend") === "on" };
  if (flags.publicSignup && process.env.NODE_ENV === "production" && (!getTurnstileSiteKey() || !isTurnstileEnabled()))
    return { error: "Configure the Turnstile site and secret keys before opening public signup." };
  await setNewsletterFlags(flags);
  return { success: true };
}

export default function NewsletterSettings() {
  const { flags, signupVerificationReady } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return <div className="mx-auto max-w-3xl p-4 md:p-6">
    <Link to="/manage/newsletter" className="text-sm text-harbour-600 underline">&larr; Newsletter</Link>
    <h1 className="mt-4 text-2xl font-semibold text-harbour-700">Newsletter rollout</h1>
    <p className="mt-2 text-sm text-harbour-500">Both controls start off. Pilot email can be sent while full-list sending is off.</p>
    {!signupVerificationReady && <p className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">Public signup needs Turnstile site and secret keys before it can be enabled in production.</p>}
    {result && "error" in result && <p className="mt-4 border border-red-200 bg-red-50 p-3 text-red-700">{result.error}</p>}
    {result?.success && <p className="mt-4 border border-green-200 bg-green-50 p-3 text-green-700">Settings saved.</p>}
    <Form method="post" className="mt-6 space-y-4">
      <label className="flex gap-3 border border-harbour-200 p-4"><input type="checkbox" name="publicSignup" defaultChecked={flags.publicSignup} /><span><strong className="block text-harbour-700">Public signup</strong><span className="text-sm text-harbour-500">Show the form on Stay Connected and accept public subscriptions.</span></span></label>
      <label className="flex gap-3 border border-harbour-200 p-4"><input type="checkbox" name="liveSend" defaultChecked={flags.liveSend} /><span><strong className="block text-harbour-700">Full-list sending</strong><span className="text-sm text-harbour-500">Allow sending a campaign to every confirmed subscriber.</span></span></label>
      <button className="bg-harbour-600 px-4 py-2 font-medium text-white">Save settings</button>
    </Form>
  </div>;
}
