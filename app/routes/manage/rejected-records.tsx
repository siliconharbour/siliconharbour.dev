import { Link, useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/rejected-records";
import { operationCatalog } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { requireAdmin } from "~/lib/session.server";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { user } = await requireAdmin(request);
  const rawOffset = Number(new URL(request.url).searchParams.get("offset"));
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const page = await operationCatalog.rejectedRecordList.execute(adminContext(user.id), {
    offset,
    limit: 20,
  });
  return { ...page, offset, now: new Date().toISOString() };
}
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const operation =
    form.get("intent") === "restore"
      ? operationCatalog.rejectedRecordRestore
      : form.get("intent") === "delete"
        ? operationCatalog.rejectedRecordDelete
        : null;
  if (!operation) throw new Response("Unknown action", { status: 400 });
  return runAdminOperation(request, operation, { id: Number(form.get("id")), confirm: true });
}
export function meta() {
  return [{ title: "Rejected records - Manage" }];
}
export default function RejectedRecords() {
  const { items, total, nextOffset, offset, now } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  return (
    <main className="max-w-6xl mx-auto p-pad-6 flex flex-col gap-gap-4">
      <Link to="/manage" className="text-body">
        ← Manage
      </Link>
      <h1 className="text-2xl font-semibold text-heading">Rejected records</h1>
      <p className="text-muted">
        Restore within seven days. Permanent deletion removes images and related records.
      </p>
      {fetcher.data && !fetcher.data.ok && (
        <p role="alert" className="text-red-700">
          {fetcher.data.error}
        </p>
      )}
      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm text-body">
          <thead className="bg-soft">
            <tr>
              {["Name", "Type", "Rejected", "Restore until", "Actions"].map((label) => (
                <th key={label} className="p-pad-3 text-left">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-harbour-100">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="p-pad-3">{item.name}</td>
                <td className="p-pad-3">{item.type}</td>
                <td className="p-pad-3">{new Date(item.rejectedAt).toLocaleDateString()}</td>
                <td className="p-pad-3">{new Date(item.expiresAt).toLocaleDateString()}</td>
                <td className="p-pad-3">
                  <fetcher.Form
                    method="post"
                    className="flex gap-gap-2"
                    onSubmit={(event) => {
                      if (
                        (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
                          "delete" &&
                        !window.confirm(`Permanently delete ${item.name}?`)
                      )
                        event.preventDefault();
                    }}
                  >
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      name="intent"
                      value="restore"
                      disabled={fetcher.state !== "idle" || item.expiresAt <= now}
                      className="border border-line px-pad-3 py-pad-1 disabled:opacity-50"
                    >
                      Restore
                    </button>
                    <button
                      name="intent"
                      value="delete"
                      disabled={fetcher.state !== "idle"}
                      className="border border-red-200 text-red-700 px-pad-3 py-pad-1"
                    >
                      Delete
                    </button>
                  </fetcher.Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <p className="p-pad-4 text-muted">No rejected records.</p>}
      </div>
      <nav aria-label="Rejected record pages" className="flex gap-gap-4 text-sm">
        {offset > 0 && <Link to={`?offset=${Math.max(0, offset - 20)}`}>Previous</Link>}
        <span>{total} records</span>
        {nextOffset !== null && <Link to={`?offset=${nextOffset}`}>Next</Link>}
      </nav>
    </main>
  );
}
