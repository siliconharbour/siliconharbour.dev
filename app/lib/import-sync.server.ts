import type { OperationContext } from "~/operations/context";
import { getAllEventImportSources, syncEvents } from "./event-importers/sync.server";
import { orderEventSourcesForSync } from "./event-importers/source-order";
import { getAllImportSourcesWithStats, syncJobs } from "./job-importers/sync.server";
import { getAllNewsImportSources, syncNewsSource } from "./news-importers/sync.server";
import { startAsyncSync, type AsyncSyncTask, type AsyncSyncTaskType } from "./async-syncs.server";

export async function importSyncAll(
  types: readonly AsyncSyncTaskType[],
  actor: OperationContext["actor"],
) {
  const tasks: AsyncSyncTask[] = [];
  if (types.includes("event"))
    for (const source of orderEventSourcesForSync(await getAllEventImportSources()))
      tasks.push({
        type: "event",
        sourceId: source.id,
        name: source.name,
        run: () => syncEvents(source.id),
      });
  if (types.includes("job"))
    for (const source of await getAllImportSourcesWithStats())
      tasks.push({
        type: "job",
        sourceId: source.id,
        name: source.companyName ?? source.sourceIdentifier,
        run: () => syncJobs(source.id),
      });
  if (types.includes("news"))
    for (const source of await getAllNewsImportSources())
      tasks.push({
        type: "news",
        sourceId: source.id,
        name: source.name,
        run: () => syncNewsSource(source.id),
      });
  return startAsyncSync(tasks, actor);
}
