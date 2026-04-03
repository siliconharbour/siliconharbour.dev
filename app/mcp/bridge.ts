/**
 * Host bridge: real DB/sync functions exposed directly into the QuickJS sandbox.
 * Each function is called on-demand by user code — no pre-fetching.
 */

import type { HostFunctions } from "./sandbox.js";
import { getUpcomingEvents, getPaginatedEvents } from "~/lib/events.server";
import { getPaginatedJobs } from "~/lib/jobs.server";
import { getPaginatedCompanies } from "~/lib/companies.server";
import { getPaginatedGroups } from "~/lib/groups.server";
import { getPaginatedPeople } from "~/lib/people.server";
import { getAllTechnologies } from "~/lib/technologies.server";
import { getPaginatedEducation } from "~/lib/education.server";
import {
  getAllEventImportSources,
  syncEvents,
} from "~/lib/event-importers/sync.server";
import {
  getAllImportSources,
  syncJobs,
} from "~/lib/job-importers/sync.server";
import { db } from "~/db";
import { events, jobs, companies } from "~/db/schema";
import { eq, and } from "drizzle-orm";

/** Strip non-serialisable values (Dates → ISO strings, etc.) */
function toPlain<T>(val: T): T {
  return JSON.parse(
    JSON.stringify(val, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    }),
  );
}

/** Read-only host functions — safe to expose without auth */
export function buildReadFunctions(): HostFunctions {
  return {
    async events(opts: unknown) {
      const o = (opts ?? {}) as { limit?: number; offset?: number; upcoming?: boolean };
      const limit = o.limit ?? 20;
      const offset = o.offset ?? 0;
      if (o.upcoming) {
        const all = await getUpcomingEvents();
        return toPlain(all.slice(offset, offset + limit));
      }
      const result = await getPaginatedEvents(limit, offset);
      return toPlain((result as { events?: unknown[] }).events ?? result);
    },

    async jobs(opts: unknown) {
      const o = (opts ?? {}) as { limit?: number; offset?: number; query?: string };
      const result = await getPaginatedJobs(o.limit ?? 20, o.offset ?? 0, o.query, { includeNonTechnical: true });
      return toPlain(result.items);
    },

    async companies(opts: unknown) {
      const o = (opts ?? {}) as { limit?: number; offset?: number; query?: string };
      const result = await getPaginatedCompanies(o.limit ?? 20, o.offset ?? 0, o.query);
      return toPlain(result.items);
    },

    async groups(opts: unknown) {
      const o = (opts ?? {}) as { limit?: number; offset?: number };
      const result = await getPaginatedGroups(o.limit ?? 20, o.offset ?? 0);
      return toPlain(result.items);
    },

    async people(opts: unknown) {
      const o = (opts ?? {}) as { limit?: number; offset?: number; query?: string };
      const result = await getPaginatedPeople(o.limit ?? 20, o.offset ?? 0, o.query);
      return toPlain(result.items);
    },

    async technologies(opts: unknown) {
      const o = (opts ?? {}) as { limit?: number; offset?: number };
      const all = await getAllTechnologies();
      const offset = o.offset ?? 0;
      return toPlain(all.slice(offset, offset + (o.limit ?? 20)));
    },

    async education(opts: unknown) {
      const o = (opts ?? {}) as { limit?: number; offset?: number };
      const result = await getPaginatedEducation(o.limit ?? 20, o.offset ?? 0);
      return toPlain(result.items);
    },
  };
}

/** Execute host functions — superset of read, adds sync and pending actions */
export function buildExecuteFunctions(): HostFunctions {
  return {
    ...buildReadFunctions(),

    async eventImportSources() {
      const sources = await getAllEventImportSources();
      return toPlain(sources.map((s) => ({
        id: s.id,
        name: s.name,
        sourceType: s.sourceType,
        lastFetchedAt: s.lastFetchedAt,
        fetchStatus: s.fetchStatus,
        pendingCount: s.pendingCount,
      })));
    },

    async jobImportSources() {
      const sources = await getAllImportSources();
      return toPlain(sources.map((s) => ({
        id: s.id,
        name: s.sourceIdentifier,
        sourceType: s.sourceType,
        lastFetchedAt: s.lastFetchedAt,
        fetchStatus: s.fetchStatus,
      })));
    },

    async pendingEvents() {
      const sources = await getAllEventImportSources();
      const pending: unknown[] = [];
      for (const source of sources) {
        const evts = await db
          .select({ id: events.id, title: events.title, firstSeenAt: events.firstSeenAt })
          .from(events)
          .where(and(eq(events.importSourceId, source.id), eq(events.importStatus, "pending_review")))
          .limit(50);
        for (const e of evts) {
          pending.push({ sourceId: source.id, sourceName: source.name, eventId: e.id, title: e.title, firstSeenAt: e.firstSeenAt });
        }
      }
      return toPlain(pending);
    },

    async pendingJobs() {
      const sources = await getAllImportSources();
      const pending: unknown[] = [];
      for (const source of sources) {
        const jobRows = await db
          .select({ id: jobs.id, title: jobs.title, companyId: jobs.companyId })
          .from(jobs)
          .where(and(eq(jobs.sourceId, source.id), eq(jobs.status, "pending_review")))
          .limit(50);
        for (const j of jobRows) {
          const [company] = j.companyId
            ? await db.select({ name: companies.name }).from(companies).where(eq(companies.id, j.companyId)).limit(1)
            : [];
          pending.push({ sourceId: source.id, sourceName: source.sourceIdentifier, jobId: j.id, title: j.title, companyName: company?.name ?? null });
        }
      }
      return toPlain(pending);
    },

    async syncEventSource(sourceId: unknown) {
      return toPlain(await syncEvents(Number(sourceId)));
    },

    async syncAllEventSources() {
      const sources = await getAllEventImportSources();
      const results = [];
      for (const source of sources) {
        const result = await syncEvents(source.id);
        results.push({ sourceId: source.id, name: source.name, ...result });
      }
      return toPlain(results);
    },

    async syncJobSource(sourceId: unknown) {
      return toPlain(await syncJobs(Number(sourceId)));
    },

    async syncAllJobSources() {
      const sources = await getAllImportSources();
      const results = [];
      for (const source of sources) {
        const result = await syncJobs(source.id);
        results.push({ sourceId: source.id, name: source.sourceIdentifier, ...result });
      }
      return toPlain(results);
    },
  };
}
