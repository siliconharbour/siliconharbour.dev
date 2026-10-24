import { useFetcher } from "react-router";
import { useEffect, useState } from "react";
import type { DirectoryFetchReport } from "~/operations/contracts/importers";
import type { runDirectoryImportAction } from "~/lib/admin/directory-import-action.server";
import { formatInTimezone } from "~/lib/timezone";

export function DirectoryMembershipReview({
  report,
  sourceLabel,
}: {
  report: DirectoryFetchReport;
  sourceLabel: string;
}) {
  const fetcher = useFetcher<Awaited<ReturnType<typeof runDirectoryImportAction>>>();
  const fetcherData = fetcher.data;
  const error = fetcherData && "error" in fetcherData ? fetcherData.error : null;
  const [droppedOff, setDroppedOff] = useState(report.droppedOff);
  const [warning, setWarning] = useState(report.warning);
  const [droppedSelection, setDroppedSelection] = useState<Set<string>>(new Set());
  useEffect(() => {
    setDroppedOff(report.droppedOff);
    setWarning(report.warning);
    setDroppedSelection(new Set());
  }, [report]);
  useEffect(() => {
    if (fetcherData?.intent === "clear-flags" && "entities" in fetcherData) {
      const cleared = new Set(fetcherData.entities.map((entity) => `${entity.type}:${entity.id}`));
      setDroppedOff((previous) =>
        previous.filter((entry) => !cleared.has(`${entry.type}:${entry.id}`)),
      );
      setDroppedSelection(new Set());
    }
    if (fetcherData?.intent === "reconcile") {
      const message = "warning" in fetcherData ? fetcherData.warning : fetcherData.error;
      if (message) {
        setWarning(message);
        setDroppedOff([]);
        setDroppedSelection(new Set());
      }
    }
  }, [fetcherData]);
  return (
    <section className="border border-harbour-200 p-pad-4 flex flex-col gap-gap-3">
      <div className="flex flex-wrap items-center justify-between gap-gap-2">
        <h2 className="font-semibold text-heading">No longer listed</h2>
        {!warning && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="reconcile" />
            <button
              disabled={fetcher.state !== "idle"}
              className="border border-harbour-300 px-pad-3 py-pad-2 text-sm text-body disabled:opacity-50"
            >
              Record current matches
            </button>
          </fetcher.Form>
        )}
      </div>
      {warning ? (
        <p className="border border-amber-200 bg-amber-50 p-pad-3 text-sm text-amber-800">
          {warning}
        </p>
      ) : droppedOff.length === 0 ? (
        <p className="text-sm text-muted">All flagged entries matched the directory.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-harbour-50 text-left">
                <tr>
                  <th className="p-pad-2">Review</th>
                  <th className="p-pad-2">Name</th>
                  <th className="p-pad-2">Last seen</th>
                  <th className="p-pad-2">Possible match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                {droppedOff.map((entry) => {
                  const key = `${entry.type}:${entry.id}`;
                  return (
                    <tr key={key}>
                      <td className="p-pad-2">
                        <input
                          type="checkbox"
                          aria-label={`Clear ${entry.name} membership`}
                          disabled={fetcher.state !== "idle"}
                          checked={droppedSelection.has(key)}
                          onChange={(event) =>
                            setDroppedSelection((previous) => {
                              const next = new Set(previous);
                              if (event.target.checked) next.add(key);
                              else next.delete(key);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="p-pad-2">
                        <a
                          href={`/manage/${entry.type === "company" ? "companies" : "education"}/${entry.id}`}
                          className="text-harbour-600 underline"
                        >
                          {entry.name}
                        </a>
                        {entry.website && <p className="text-xs text-muted">{entry.website}</p>}
                      </td>
                      <td className="p-pad-2">
                        {entry.lastSeenAt
                          ? formatInTimezone(new Date(entry.lastSeenAt), "MMM d, yyyy")
                          : "Not recorded"}
                      </td>
                      <td className="p-pad-2">
                        {entry.possibleMatch ? (
                          <>
                            {entry.possibleMatch.name}
                            {entry.possibleMatch.website && (
                              <p className="text-xs text-muted">{entry.possibleMatch.website}</p>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={!droppedSelection.size || fetcher.state !== "idle"}
            className="self-start border border-harbour-300 px-pad-3 py-pad-2 text-sm text-body disabled:opacity-50"
            onClick={() => {
              if (
                !window.confirm(
                  `Clear ${sourceLabel} membership for ${droppedSelection.size} selected entries?`,
                )
              )
                return;
              const entities = droppedOff
                .filter((entry) => droppedSelection.has(`${entry.type}:${entry.id}`))
                .map(({ type, id }) => ({ type, id }));
              fetcher.submit(
                { intent: "clear-flags", entities: JSON.stringify(entities) },
                { method: "post" },
              );
            }}
          >
            Clear selected memberships ({droppedSelection.size})
          </button>
        </>
      )}
      {fetcherData?.intent === "clear-flags" && "cleared" in fetcherData && (
        <p className="text-sm text-green-700">Cleared {fetcherData.cleared} memberships.</p>
      )}
      {fetcherData?.intent === "reconcile" && "recorded" in fetcherData && (
        <p className="text-sm text-muted">
          {fetcherData.warning ?? `Recorded ${fetcherData.recorded} matches.`}
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
