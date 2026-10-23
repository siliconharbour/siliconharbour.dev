import { loadAdminOperation, runAdminOperation } from "~/lib/admin/run-operation.server";
import { operationCatalog } from "~/operations/catalog";

import type { Route } from "./+types/subscriber-new";
import { Form, Link, redirect, useActionData } from "react-router";

import { requireAdmin } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Add newsletter subscriber - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  await loadAdminOperation(request, operationCatalog.newsletterListGet, {});
  const { pilotCount } = await loadAdminOperation(
    request,
    operationCatalog.newsletterSettingsGet,
    {},
  );
  return { pilotCount };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const result =
    intent === "add-pilot"
      ? await runAdminOperation(request, operationCatalog.newsletterPilotSubscribe, {
          confirm: true,
        })
      : intent === "add"
        ? await runAdminOperation(request, operationCatalog.newsletterSubscriberCreate, {
            email: form.get("email"),
            firstName: form.get("firstName") ?? null,
            lastName: form.get("lastName") ?? null,
            confirm: true,
          })
        : null;
  if (!result) return { error: "Unknown subscriber action." } as const;
  return result.ok
    ? redirect("/manage/newsletter/subscribers?notice=confirmation-requested")
    : ({ error: result.error } as const);
}

export default function AddNewsletterSubscriber({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  return (
    <div className="mx-auto max-w-3xl p-pad-4 md:p-pad-6">
      <Link to="/manage/newsletter/subscribers" className="text-sm text-body underline">
        &larr; Subscribers
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-heading">Add subscriber</h1>
      <p className="mt-1 text-sm text-muted">
        Lists sends a confirmation email. An address receives campaigns only after confirmation.
      </p>
      {actionData?.error && (
        <p className="mt-4 border border-red-200 bg-red-50 p-pad-3 text-sm text-red-700">
          {actionData.error}
        </p>
      )}
      <Form method="post" className="mt-6 space-y-4 border border-line bg-surface p-pad-4">
        <input type="hidden" name="intent" value="add" />
        <label className="block text-sm font-medium text-heading">
          Email address
          <input
            type="email"
            name="email"
            required
            className="mt-1 block w-full border border-line px-pad-3 py-pad-2"
          />
        </label>
        <div className="grid gap-gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-heading">
            First name
            <input
              name="firstName"
              className="mt-1 block w-full border border-line px-pad-3 py-pad-2"
            />
          </label>
          <label className="block text-sm font-medium text-heading">
            Last name
            <input
              name="lastName"
              className="mt-1 block w-full border border-line px-pad-3 py-pad-2"
            />
          </label>
        </div>
        <button className="bg-primary px-pad-4 py-pad-2 text-sm font-medium text-white hover:bg-primary-hover">
          Send confirmation
        </button>
      </Form>
      {loaderData.pilotCount > 0 && (
        <Form method="post" className="mt-6 border border-line bg-soft p-pad-4">
          <input type="hidden" name="intent" value="add-pilot" />
          <p className="text-sm text-body">
            Request confirmation for eligible pilot addresses that have not confirmed yet.
          </p>
          <button className="mt-3 border border-line bg-surface px-pad-3 py-pad-2 text-sm font-medium text-heading hover:bg-tint">
            Send to {loaderData.pilotCount} pilot addresses
          </button>
        </Form>
      )}
    </div>
  );
}
