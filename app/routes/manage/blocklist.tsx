import { requireAdmin } from "~/lib/session.server";
import type { Route } from "./+types/blocklist";
import { Form, Link, useFetcher, useLoaderData } from "react-router";
import { loadAdminOperation, runAdminOperation } from "~/lib/admin/run-operation.server";
import { operationCatalog } from "~/operations/catalog";
import { blocklistSource, type blocklistItemOutput } from "~/operations/contracts/blocklist";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import type { z } from "zod";

export function meta() {
  return [{ title: "Import blocklist - Manage" }];
}
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const query = url.searchParams.get("q") ?? "";
  const source = url.searchParams.get("source") ?? "";
  const result = await loadAdminOperation(request, operationCatalog.blocklistList, {
    limit,
    offset,
    query,
    ...(source ? { source } : {}),
  });
  return { ...result, limit, offset, query, source };
}
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  if (form.get("intent") === "update") {
    const result = await runAdminOperation(request, operationCatalog.blocklistUpdate, {
      id: Number(form.get("id")),
      name: form.get("name"),
      reason: form.get("reason"),
    });
    return result.ok ? { saved: true } : { error: result.error };
  }
  if (form.get("intent") === "remove") {
    const result = await runAdminOperation(request, operationCatalog.blocklistRemove, {
      source: form.get("source"),
      externalId: form.get("key"),
    });
    return result.ok ? { removed: result.data.removed } : { error: result.error };
  }
  throw new Response("Unknown action", { status: 400 });
}
function BlockRow({ item }: { item: z.output<typeof blocklistItemOutput> }) {
  const fetcher = useFetcher<typeof action>();
  return (
    <tr>
      <td className="p-pad-3 align-top">
        <div className="text-xs text-muted">{item.source}</div>
        <div className="break-all font-medium text-heading">{item.key}</div>
        <time dateTime={item.blockedAt} className="text-xs text-muted">
          {new Date(item.blockedAt).toLocaleDateString()}
        </time>
      </td>
      <td className="p-pad-3">
        <fetcher.Form method="post" className="flex flex-col gap-gap-2">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="source" value={item.source} />
          <input type="hidden" name="key" value={item.key} />
          <label className="flex flex-col gap-gap-1 text-sm text-body">
            Name
            <input
              name="name"
              required
              maxLength={500}
              defaultValue={item.name}
              className="border border-line bg-surface px-pad-3 py-pad-2"
            />
          </label>
          <label className="flex flex-col gap-gap-1 text-sm text-body">
            Reason
            <textarea
              name="reason"
              maxLength={2000}
              defaultValue={item.reason ?? ""}
              rows={2}
              className="border border-line bg-surface px-pad-3 py-pad-2"
            />
          </label>
          <div className="flex gap-gap-2">
            <button
              name="intent"
              value="update"
              disabled={fetcher.state !== "idle"}
              className="bg-primary px-pad-3 py-pad-1-5 text-sm font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              name="intent"
              value="remove"
              disabled={fetcher.state !== "idle"}
              formNoValidate
              onClick={(event) => {
                if (!confirm(`Unblock ${item.name}? Future imports may bring this record back.`))
                  event.preventDefault();
              }}
              className="border border-line px-pad-3 py-pad-1-5 text-sm text-body disabled:opacity-50"
            >
              Unblock
            </button>
          </div>
          {fetcher.data && "error" in fetcher.data && (
            <p role="alert" className="text-sm text-red-700">
              {fetcher.data.error}
            </p>
          )}
          {fetcher.data && "saved" in fetcher.data && (
            <p role="status" className="text-sm text-green-700">
              Saved
            </p>
          )}
        </fetcher.Form>
      </td>
    </tr>
  );
}
export default function Blocklist() {
  const { items, total, limit, offset, query, source } = useLoaderData<typeof loader>();
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-gap-4 p-pad-6">
      <Link to="/manage" className="text-sm text-body">
        ← Manage
      </Link>
      <h1 className="text-2xl font-semibold text-heading">Import blocklist</h1>
      <Form method="get" className="flex flex-wrap items-end gap-gap-3">
        <label className="flex flex-col gap-gap-1 text-sm text-body">
          Search
          <input
            name="q"
            defaultValue={query}
            maxLength={500}
            className="border border-line bg-surface px-pad-3 py-pad-2"
          />
        </label>
        <label className="flex flex-col gap-gap-1 text-sm text-body">
          Source
          <select
            name="source"
            defaultValue={source}
            className="border border-line bg-surface px-pad-3 py-pad-2"
          >
            <option value="">All sources</option>
            {blocklistSource.options.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button className="border border-line px-pad-3 py-pad-2 text-sm text-body">Search</button>
      </Form>
      <p className="text-sm text-muted">{total} blocked identities</p>
      <div className="overflow-x-auto border border-line">
        <table className="w-full text-left">
          <thead className="bg-harbour-50">
            <tr>
              <th className="p-pad-3">Identity</th>
              <th className="p-pad-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-harbour-100">
            {items.map((item) => (
              <BlockRow key={item.id} item={item} />
            ))}
          </tbody>
        </table>
        {!items.length && <p className="p-pad-4 text-sm text-muted">No matching blocks.</p>}
      </div>
      <Pagination total={total} limit={limit} offset={offset} />
    </main>
  );
}
