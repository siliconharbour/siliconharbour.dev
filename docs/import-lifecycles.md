# Import execution

GitHub imports keep their run identity, progress and pause reason in `import_jobs`.
Following imports also checkpoint the queue, fetched profiles and per-profile errors.
They survive a server restart. A failed initial connection-list fetch has no queue
and must be started again.

| Event    | Allowed state    | Result                                                                  |
| -------- | ---------------- | ----------------------------------------------------------------------- |
| Continue | running          | Checkpoint a batch, then running, completed, rate-limit pause or failed |
| Pause    | running          | Finish any active batch, then pause with reason user                    |
| Resume   | paused or failed | Running, unless the quota reset is still in the future                  |
| Reset    | any existing run | Finish any active batch, then remove progress; imported people remain   |

Location start resumes an unfinished run; completed runs require reset. Following
start fetches a new connection list and replaces the prior run. An empty list is
stored as a completed run. Continue, pause, resume and reset carry the run ID from
status, so stale controls cannot operate on a replacement run.

`withWorkLock` owns in-process execution. Duplicate execution requests fail with a
conflict rather than queue another batch. Pause/reset wait for the current batch;
they do not abort an external request or roll back already imported people. The
lock is shared by the admin and MCP paths. It assumes one application process;
it is not a distributed lease. Do not run multiple import workers against one DB
without adding database-backed ownership.

Migration 0063 cannot recover queues that were only in memory. It marks old
following runs as failed initialization requiring a fresh start; location progress
is retained. New following runs checkpoint each completed profile. A process exit
may repeat the current read-only profile request, but cannot lose earlier results.

## Event, job and news sources

All sync entry points claim the same `source:<type>:<id>` execution key, including
manual job snapshots. Conflicting syncs fail before touching the source. Different
sources can run independently. Source fetch status/error describes the last result;
starting another request does not erase that result or persist a misleading running
flag. `pending` means no completed result has been recorded, not an active lock.

Async orchestration exposes running, completed or failed snapshots. Each step owns
its result or error and completion time; counts are derived from steps. Runs have a
20-slot process-local cap, including active runs. Restart discards this observation
history, not the writes already made. An unknown run ID must not trigger automatic
replay: inspect the source and explicitly start another sync if appropriate. This is
not a durable job scheduler or a promise of rollback after interruption.
