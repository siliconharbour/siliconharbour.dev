import { asyncSyncOutput as asyncResult } from "../contracts/importers";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError, InvalidOperationError } from "../errors";
import { toPlain } from "../plain";
import { emptyInput, deleteInput } from "../fields";
import {
  eventSourceCreateInput,
  eventSourceUpdateInput,
  eventSyncInput,
  eventSyncAllInput,
  eventSyncOutput,
  eventSourceOutput,
} from "../contracts/events";
import {
  getAllEventImportSources,
  getEventImportSourceById,
  createEventImportSource,
  updateEventImportSource,
  deleteEventImportSource,
  validateEventImportSourceConfig,
  syncEvents,
} from "~/lib/event-importers/sync.server";
import { syncAllEventSources } from "~/lib/event-importers/sync-all.server";
import { orderEventSourcesForSync } from "~/lib/event-importers/source-order";
import { startAsyncSync } from "~/mcp/async-syncs";
async function requireSource(id: number) {
  const source = await getEventImportSourceById(id);
  if (!source) throw new NotFoundError("Event source not found");
  return source;
}

export const eventSourceOperations = {
  eventSourceList: defineOperation({
    name: "eventSourceList",
    area: "events",
    risk: "read",
    access: "admin",
    summary: "List event import sources.",
    description: "Return source configuration, fetch status, and pending/published event counts.",
    input: emptyInput,
    output: z.array(
      eventSourceOutput.extend({ pendingCount: z.number(), publishedCount: z.number() }).strict(),
    ),
    examples: [{ title: "All sources", input: {} }],
    run: async () => toPlain(await getAllEventImportSources()),
  }),
  eventSourceCreate: defineOperation({
    name: "eventSourceCreate",
    area: "events",
    risk: "external",
    access: "admin",
    summary: "Validate and create an event import source.",
    description:
      "Validate configuration using the selected importer, which may fetch the source. Store the source without importing events. Requires confirm: true. Use eventSourceSync to import.",
    input: eventSourceCreateInput,
    output: eventSourceOutput,
    examples: [
      {
        title: "Add source",
        input: {
          name: "Meetups",
          sourceType: "meetup",
          sourceIdentifier: "example",
          sourceUrl: "https://www.meetup.com/example",
          confirm: true,
        },
      },
    ],
    run: async (_ctx, input) => {
      const { name, organizer, sourceType, sourceIdentifier, sourceUrl } = input;
      const config = {
        name,
        sourceType,
        sourceIdentifier,
        sourceUrl,
        organizer: organizer ?? null,
      };
      const result = await validateEventImportSourceConfig(config);
      if (!result.valid)
        throw new InvalidOperationError(result.error ?? "Invalid source configuration");
      return toPlain(await createEventImportSource(config));
    },
  }),
  eventSourceUpdate: defineOperation({
    name: "eventSourceUpdate",
    area: "events",
    risk: "write",
    access: "admin",
    summary: "Update event source configuration.",
    description:
      "Patch name, organizer, identifier, or URL. The importer type is fixed at creation. No live sync runs.",
    input: eventSourceUpdateInput,
    output: eventSourceOutput,
    examples: [{ title: "Rename source", input: { id: 1, name: "Meetups" } }],
    run: async (_ctx, { id, ...fields }) => {
      await requireSource(id);
      await updateEventImportSource(id, fields);
      return toPlain(await requireSource(id));
    },
  }),
  eventSourceDelete: defineOperation({
    name: "eventSourceDelete",
    area: "events",
    risk: "destructive",
    access: "admin",
    summary: "Delete an event import source.",
    description:
      "Delete pending, hidden, and removed imported events and their images. Preserve approved/published events and detach their source. Requires confirm: true.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true) }).strict(),
    examples: [{ title: "Delete source", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id }) => {
      await requireSource(id);
      await deleteEventImportSource(id);
      return { deleted: true as const };
    },
  }),
  eventSourceSync: defineOperation({
    name: "eventSourceSync",
    area: "events",
    risk: "external",
    access: "admin",
    summary: "Sync one event import source.",
    description:
      "Fetch live source data and update imported events. Requires confirm: true. Set async to return a run ID immediately; poll asyncSyncGet.",
    input: eventSyncInput,
    output: z.union([eventSyncOutput, asyncResult]),
    examples: [{ title: "Sync source", input: { id: 1, confirm: true } }],
    run: async (_ctx, input) => {
      const source = await requireSource(input.id);
      return input.async
        ? startAsyncSync([
            {
              type: "event",
              sourceId: source.id,
              name: source.name,
              run: () => syncEvents(source.id),
            },
          ])
        : syncEvents(source.id);
    },
  }),
  eventSourceSyncAll: defineOperation({
    name: "eventSourceSyncAll",
    area: "events",
    risk: "external",
    access: "admin",
    summary: "Sync all event import sources.",
    description:
      "Fetch each configured source in the existing source order. Requires confirm: true. Set async to return a run ID and poll asyncSyncGet.",
    input: eventSyncAllInput,
    output: z.union([
      eventSyncOutput.extend({ errors: z.array(z.string()) }).strict(),
      asyncResult,
    ]),
    examples: [{ title: "Sync all", input: { confirm: true } }],
    run: async (_ctx, input) =>
      input.async
        ? startAsyncSync(
            orderEventSourcesForSync(await getAllEventImportSources()).map((source) => ({
              type: "event" as const,
              sourceId: source.id,
              name: source.name,
              run: () => syncEvents(source.id),
            })),
          )
        : syncAllEventSources(),
  }),
};
