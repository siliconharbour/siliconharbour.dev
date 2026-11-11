import { formatError } from "~/mcp/errors";
import { getAllEventImportSources, syncEvents } from "./sync.server";
import { orderEventSourcesForSync } from "./source-order";
export async function syncAllEventSources() {
  let added = 0,
    skipped = 0,
    removed = 0;
  const errors: string[] = [];
  for (const source of orderEventSourcesForSync(await getAllEventImportSources())) {
    try {
      const result = await syncEvents(source.id);
      added += result.added;
      skipped += result.skipped;
      removed += result.removed;
      if (!result.success) errors.push(`${source.name}: ${result.error ?? "Sync failed"}`);
    } catch (error) {
      errors.push(`${source.name}: ${formatError(error)}`);
    }
  }
  return { success: errors.length === 0, added, skipped, removed, errors };
}
