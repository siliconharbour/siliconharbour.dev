/**
 * Host bridge: fetches data from the real DB and returns it as plain JSON-serialisable
 * objects suitable for baking into the QuickJS virtual module strings.
 */

import { getUpcomingEvents } from "~/lib/events.server";
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
import type { ReadData } from "./modules/siliconharbour-read.js";
import type { ExecuteData } from "./modules/siliconharbour-execute.js";

/** Strip non-serialisable values (Dates → ISO strings, undefined → null, etc.) */
function toPlain<T>(val: T): T {
  return JSON.parse(
    JSON.stringify(val, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    }),
  );
}

export async function fetchReadData(): Promise<ReadData> {
  const [eventsResult, jobsResult, companiesResult, groupsResult, peopleResult, techsResult, eduResult] =
    await Promise.all([
      getUpcomingEvents().then((items) => toPlain(items.slice(0, 50))),
      getPaginatedJobs(50, 0, undefined, { includeNonTechnical: true }).then((r) => toPlain(r.items)),
      getPaginatedCompanies(50, 0).then((r) => toPlain(r.items)),
      getPaginatedGroups(50, 0).then((r) => toPlain(r.items)),
      getPaginatedPeople(50, 0).then((r) => toPlain(r.items)),
      getAllTechnologies().then((items) => toPlain(items.slice(0, 100))),
      getPaginatedEducation(50, 0).then((r) => toPlain(r.items)),
    ]);

  return {
    events: eventsResult,
    jobs: jobsResult,
    companies: companiesResult,
    groups: groupsResult,
    people: peopleResult,
    technologies: techsResult,
    education: eduResult,
  };
}

export async function fetchPendingEvents(): Promise<unknown[]> {
  const sources = await getAllEventImportSources();
  const pending: unknown[] = [];

  for (const source of sources) {
    const evts = await db
      .select({ id: events.id, title: events.title, firstSeenAt: events.firstSeenAt })
      .from(events)
      .where(and(eq(events.importSourceId, source.id), eq(events.importStatus, "pending_review")))
      .limit(50);

    for (const e of evts) {
      pending.push({
        sourceId: source.id,
        sourceName: source.name,
        eventId: e.id,
        title: e.title,
        firstSeenAt: e.firstSeenAt,
      });
    }
  }

  return toPlain(pending);
}

export async function fetchPendingJobs(): Promise<unknown[]> {
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
        ? await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, j.companyId))
            .limit(1)
        : [];

      pending.push({
        sourceId: source.id,
        sourceName: source.sourceIdentifier,
        jobId: j.id,
        title: j.title,
        companyName: company?.name ?? null,
      });
    }
  }

  return toPlain(pending);
}

export async function fetchExecuteData(): Promise<ExecuteData> {
  const [readData, eventSources, jobSources, pendingEvts, pendingJobsList] = await Promise.all([
    fetchReadData(),
    getAllEventImportSources().then((sources) =>
      toPlain(
        sources.map((s) => ({
          id: s.id,
          name: s.name,
          sourceType: s.sourceType,
          lastFetchedAt: s.lastFetchedAt,
          fetchStatus: s.fetchStatus,
          pendingCount: s.pendingCount,
        })),
      ),
    ),
    getAllImportSources().then((sources) =>
      toPlain(
        sources.map((s) => ({
          id: s.id,
          name: s.sourceIdentifier,
          sourceType: s.sourceType,
          lastFetchedAt: s.lastFetchedAt,
          fetchStatus: s.fetchStatus,
        })),
      ),
    ),
    fetchPendingEvents(),
    fetchPendingJobs(),
  ]);

  return {
    ...readData,
    eventImportSources: eventSources,
    jobImportSources: jobSources,
    pendingEvents: pendingEvts,
    pendingJobs: pendingJobsList,
    _syncEnabled: true,
  };
}

export type SyncResults = Record<string, unknown>;

/**
 * Pre-execute any sync operations mentioned in the user's code.
 * Detects calls to syncEventSource, syncAllEventSources, etc. and runs them,
 * storing results in a map that the module injects as globalThis.__syncResults__.
 *
 * This is a simple approach: if the code mentions a sync function, run it.
 * The results are baked into the module as __syncResults__.
 */
export async function runSyncOperations(code: string): Promise<SyncResults> {
  const results: SyncResults = {};

  if (code.includes("syncAllEventSources")) {
    const sources = await getAllEventImportSources();
    const syncResultsList = [];
    for (const source of sources) {
      const result = await syncEvents(source.id);
      syncResultsList.push({ sourceId: source.id, name: source.name, ...result });
    }
    results["syncAllEventSources"] = toPlain(syncResultsList);
  } else if (code.includes("syncEventSource")) {
    // Extract sourceId from code: syncEventSource(N)
    const matches = [...code.matchAll(/syncEventSource\((\d+)\)/g)];
    for (const m of matches) {
      const sourceId = Number(m[1]);
      const result = await syncEvents(sourceId);
      results[`syncEventSource:${sourceId}`] = toPlain(result);
    }
  }

  if (code.includes("syncAllJobSources")) {
    const sources = await getAllImportSources();
    const syncResultsList = [];
    for (const source of sources) {
      const result = await syncJobs(source.id);
      syncResultsList.push({ sourceId: source.id, name: source.sourceIdentifier, ...result });
    }
    results["syncAllJobSources"] = toPlain(syncResultsList);
  } else if (code.includes("syncJobSource")) {
    const matches = [...code.matchAll(/syncJobSource\((\d+)\)/g)];
    for (const m of matches) {
      const sourceId = Number(m[1]);
      const result = await syncJobs(sourceId);
      results[`syncJobSource:${sourceId}`] = toPlain(result);
    }
  }

  return results;
}
