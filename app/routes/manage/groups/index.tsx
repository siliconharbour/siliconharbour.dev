import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { operationCatalog } from "~/operations/catalog";
import { loadAdminOperation } from "~/lib/admin/run-operation.server";
import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { SearchInput } from "~/components/SearchInput";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Groups - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const { limit, offset } = parsePaginationParams(url, 100);
  const { items: groups, total } = await loadAdminOperation(request, operationCatalog.groupList, {
    limit,
    offset,
    query: searchQuery,
    sort: "createdAt",
    order: "desc",
  });
  return { groups, searchQuery, total, limit, offset };
}

export default function ManageGroupsIndex() {
  const { groups, total, limit, offset } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-heading">Groups</h1>
          <Link
            to="/manage/groups/new"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
          >
            New Group
          </Link>
        </div>

        <Pagination total={total} limit={limit} offset={offset} />

        <SearchInput placeholder="Search groups..." />

        {groups.length === 0 ? (
          <div className="text-center p-pad-12 text-subtle">
            No groups yet. Create your first group to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-gap-4">
            {groups.map((group) => (
              <div
                key={group.id}
                className={`flex items-center gap-gap-4 p-pad-4 border ${
                  group.visible ? "bg-surface border-line" : "bg-amber-50 border-amber-200"
                }`}
              >
                {group.logo ? (
                  <img src={`/images/${group.logo}`} alt="" className="w-12 h-12 object-contain" />
                ) : (
                  <div className="w-12 h-12 bg-tint" />
                )}

                <div className="flex-1 min-w-0 flex flex-col gap-gap-0-5">
                  <div className="flex items-center gap-gap-2">
                    <h2 className="font-medium truncate text-heading">{group.name}</h2>
                    {!group.visible && (
                      <span className="text-xs px-pad-1-5 py-pad-0-5 bg-amber-200 text-amber-700">
                        Hidden
                      </span>
                    )}
                  </div>
                  {group.meetingFrequency && (
                    <p className="text-sm text-subtle">{group.meetingFrequency}</p>
                  )}
                </div>

                <div className="flex items-center gap-gap-2">
                  <Link
                    to={`/manage/groups/${group.id}`}
                    className="px-pad-3 py-pad-1-5 text-sm font-medium text-body hover:bg-soft transition-colors"
                  >
                    Edit
                  </Link>
                  <Link
                    to={`/manage/groups/${group.id}/delete`}
                    className="px-pad-3 py-pad-1-5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <Link to="/manage" className="text-sm text-subtle hover:text-body">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
