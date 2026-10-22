import type { ColumnCoverage } from "../coverage";
export const eventsCoverage: Record<string, Record<string, ColumnCoverage>> = {
  events: {
    id: {
      excluded: "Generated identifier",
    },
    slug: {
      excluded: "Derived from name or title",
    },
    title: {
      mapped: {
        eventCreate: "title",
        eventUpdate: "title",
      },
    },
    description: {
      mapped: {
        eventCreate: "description",
        eventUpdate: "description",
      },
    },
    location: {
      mapped: {
        eventCreate: "location",
        eventUpdate: "location",
      },
    },
    link: {
      mapped: {
        eventCreate: "link",
        eventUpdate: "link",
      },
    },
    organizer: {
      mapped: {
        eventCreate: "organizer",
        eventUpdate: "organizer",
      },
    },
    coverImage: {
      mapped: {
        eventCreate: "coverImage",
        eventUpdate: "coverImage",
      },
    },
    iconImage: {
      mapped: {
        eventCreate: "iconImage",
        eventUpdate: "iconImage",
      },
    },
    coverImageUrl: {
      mapped: {
        eventCreate: "coverImageUrl",
        eventUpdate: "coverImageUrl",
      },
    },
    requiresSignup: {
      mapped: {
        eventCreate: "requiresSignup",
        eventUpdate: "requiresSignup",
      },
    },
    timeMode: {
      mapped: {
        eventCreate: "timeMode",
        eventUpdate: "timeMode",
      },
    },
    parentEventId: {
      mapped: {
        eventCreate: "parentEventId",
        eventUpdate: "parentEventId",
      },
    },
    recurrenceRule: {
      mapped: {
        eventCreate: "recurrenceRule",
        eventUpdate: "recurrenceRule",
      },
    },
    recurrenceStart: {
      mapped: {
        eventCreate: "recurrenceStart",
        eventUpdate: "recurrenceStart",
      },
    },
    recurrenceEnd: {
      mapped: {
        eventCreate: "recurrenceEnd",
        eventUpdate: "recurrenceEnd",
      },
    },
    defaultStartTime: {
      mapped: {
        eventCreate: "defaultStartTime",
        eventUpdate: "defaultStartTime",
      },
    },
    defaultEndTime: {
      mapped: {
        eventCreate: "defaultEndTime",
        eventUpdate: "defaultEndTime",
      },
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
    importSourceId: {
      excluded: "Importer ownership",
    },
    externalId: {
      excluded: "Importer identity",
    },
    importStatus: {
      mapped: {
        eventCreate: "importStatus",
        eventUpdate: "importStatus",
      },
    },
    firstSeenAt: {
      excluded: "Importer timestamp",
    },
    lastSeenAt: {
      excluded: "Importer timestamp",
    },
  },
  event_dates: {
    id: {
      excluded: "Generated identifier",
    },
    eventId: {
      mapped: {
        eventUpdate: "id",
      },
    },
    startDate: {
      mapped: {
        eventCreate: "dates[].startDate",
        eventUpdate: "dates[].startDate",
      },
    },
    endDate: {
      mapped: {
        eventCreate: "dates[].endDate",
        eventUpdate: "dates[].endDate",
      },
    },
    isAllDay: {
      mapped: {
        eventCreate: "dates[].isAllDay",
        eventUpdate: "dates[].isAllDay",
      },
    },
  },
  event_tags: {
    id: {
      excluded: "Generated identifier",
    },
    name: {
      mapped: {
        eventTagSave: "name",
      },
    },
    slug: {
      mapped: {
        eventTagSave: "name",
        eventCreate: "eventTags[]",
        eventUpdate: "eventTags[]",
      },
    },
    color: {
      mapped: {
        eventTagSave: "color",
      },
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  event_occurrences: {
    id: {
      excluded: "Generated identifier",
    },
    eventId: {
      mapped: {
        eventOccurrenceUpdate: "id",
      },
    },
    occurrenceDate: {
      mapped: {
        eventOccurrenceUpdate: "date",
      },
    },
    location: {
      mapped: {
        eventOccurrenceUpdate: "location",
      },
    },
    description: {
      mapped: {
        eventOccurrenceUpdate: "description",
      },
    },
    link: {
      mapped: {
        eventOccurrenceUpdate: "link",
      },
    },
    startTime: {
      mapped: {
        eventOccurrenceUpdate: "startTime",
      },
    },
    endTime: {
      mapped: {
        eventOccurrenceUpdate: "endTime",
      },
    },
    cancelled: {
      mapped: {
        eventOccurrenceCancel: "id",
        eventOccurrenceUncancel: "id",
      },
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
  },
  event_import_sources: {
    id: {
      excluded: "Generated identifier",
    },
    name: {
      mapped: {
        eventSourceCreate: "name",
        eventSourceUpdate: "name",
      },
    },
    organizer: {
      mapped: {
        eventSourceCreate: "organizer",
        eventSourceUpdate: "organizer",
      },
    },
    sourceType: {
      mapped: {
        eventSourceCreate: "sourceType",
      },
    },
    sourceIdentifier: {
      mapped: {
        eventSourceCreate: "sourceIdentifier",
        eventSourceUpdate: "sourceIdentifier",
      },
    },
    sourceUrl: {
      mapped: {
        eventSourceCreate: "sourceUrl",
        eventSourceUpdate: "sourceUrl",
      },
    },
    lastFetchedAt: {
      excluded: "Sync timestamp",
    },
    fetchStatus: {
      excluded: "Sync state",
    },
    fetchError: {
      excluded: "Sync diagnostics",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  event_tag_assignments: {
    id: {
      excluded: "Generated identifier",
    },
    eventId: {
      excluded: "Parent event identifier",
    },
    tagId: {
      mapped: {
        eventCreate: "tagIds[]",
        eventUpdate: "tagIds[]",
      },
    },
  },
};
