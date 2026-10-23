# Import syncs

The daily trigger lives outside this repository. Configure it to call MCP
`importSyncAll({ confirm: true })` once per day; do not schedule overlapping runs or more
frequent Luma syncs. The operator should identify the caller of the current daily
12:31 UTC run before changing that schedule. Poll the returned run ID with
`asyncSyncGet({ id })`. The external caller must use these current operation names.

```js
return await tools.siliconharbour.importSyncAll({ confirm: true });
```

Luma imports request upcoming events only. Calendar imports use the public page,
falling back to the calendar API for missing or paginated data. A rate-limited
fallback can use the page's partial list without removing missing events. Past
pending Luma events are retained when absent from the upcoming feed.

Luma HTTP requests share a process-wide serial queue, wait at least one second
between requests, and retry throttled requests at most twice within a 90-second
retry-delay budget per source. The queue is per process, so run only one importer
process. A rate-limited source retains its last successful fetch and event states;
its next scheduled sync retries automatically. Error messages include the URL path
and at most 200 characters of response text, never URL query parameters.

`lastFetchedAt` records success. The admin last-attempt display and MCP
`lastAttemptedAt` reuse the source's `updatedAt`, which also changes on source
edits. Adding `rate_limited` changes the TypeScript enum only; SQLite stores the
status as unconstrained text, so no production migration is required. The normal
generator encounters pre-existing snapshot drift; comparing Drizzle snapshots
generated directly from main and this branch produces no migration statements.

For a calendar whose page fits on one page, a steady-state sync makes one HTML
request and zero event-detail requests. User sources make one future-list request
per page (plus a profile request when configured by username). New or pending
future events may add one detail request each. Previously both importers fetched
future and past lists plus every event page on every run.
