import type { Route } from "./+types/theme-shares";
import { Link, useFetcher, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { deleteThemeShare, listThemeShares } from "~/lib/theme-shares.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const rawOffset = Number(new URL(request.url).searchParams.get("offset"));
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  return { ...listThemeShares(20, offset), offset };
}
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  if (request.method !== "POST" || request.headers.get("origin") !== new URL(request.url).origin)
    throw new Response("Same-origin POST required", { status: 403 });
  const form = await request.formData();
  if (form.get("intent") !== "delete") throw new Response("Invalid action", { status: 400 });
  return deleteThemeShare(String(form.get("id") ?? ""));
}
export function meta() {
  return [{ title: "Theme shares - Manage" }];
}
export default function ThemeShares() {
  const { items, total, offset } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  return (
    <main className="max-w-6xl mx-auto p-pad-6 flex flex-col gap-gap-4">
      <Link to="/manage" className="text-body">
        ← Manage
      </Link>
      <h1 className="text-2xl font-semibold text-heading">Theme shares</h1>
      <p className="text-muted">
        {total} saved shares. Deleting a share removes its theme and logo; local browser copies
        remain.
      </p>
      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm text-body">
          <thead className="bg-soft">
            <tr>
              {["Theme", "Logo", "Created", "Updated", "IP addresses", "Actions"].map((label) => (
                <th key={label} className="p-pad-3 text-left">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-harbour-100">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="p-pad-3">
                  <Link to={`/design/share/${item.id}`}>{item.name}</Link>
                  <p className="text-xs text-muted">Revision {item.revision}</p>
                </td>
                <td className="p-pad-3">
                  {item.logoBytes > 0 ? (
                    <>
                      <img
                        src={`/api/theme-shares/${item.id}/logo`}
                        alt=""
                        className="w-16 h-12 object-contain"
                      />
                      <span>{Math.ceil(item.logoBytes / 1024)} KB</span>
                    </>
                  ) : (
                    "None"
                  )}
                </td>
                <td className="p-pad-3 whitespace-nowrap">
                  {new Date(item.createdAt).toISOString()}
                </td>
                <td className="p-pad-3 whitespace-nowrap">
                  {new Date(item.updatedAt).toISOString()}
                </td>
                <td className="p-pad-3">
                  <p>Created: {item.createdIp}</p>
                  <p>Updated: {item.updatedIp}</p>
                </td>
                <td className="p-pad-3">
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      className="bg-red-50 text-red-700 border border-red-200 px-pad-3 py-pad-1"
                      disabled={fetcher.state !== "idle"}
                    >
                      Delete share
                    </button>
                  </fetcher.Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="p-pad-4 text-muted">No theme shares.</p>}
      </div>
      <nav className="flex gap-gap-4" aria-label="Share pages">
        {offset > 0 && <Link to={`?offset=${Math.max(0, offset - 20)}`}>Previous</Link>}
        {offset + 20 < total && <Link to={`?offset=${offset + 20}`}>Next</Link>}
      </nav>
    </main>
  );
}
