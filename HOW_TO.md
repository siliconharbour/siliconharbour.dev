# SiliconHarbour MCP — Agent How-To

This is the operating manual for an AI agent that maintains the
SiliconHarbour job board through the MCP server at
`https://siliconharbour.dev/mcp`.

Every example in this document is real, executable code. Copy it into the
`execute` tool to run it. Code is evaluated inside a hardened QuickJS
sandbox — `fetch`, `fs`, secrets, and the process env are unavailable. The
only way to do anything useful is by importing functions from the
`'siliconharbour'` module.

> If you only need to read public data, prefer the `query` tool instead of
> `execute`. It exposes the same `'siliconharbour'` imports but is safer
> for read-only work and runs without an API token. Use `execute` when you
> need to write, sync, review, or call the discovery functions.

## Table of contents

1. [What you're maintaining](#what-youre-maintaining)
2. [Daily routine](#daily-routine)
3. [Discovering new jobs](#discovering-new-jobs)
   - [TechNL job board](#technl-job-board)
   - [LinkedIn search](#linkedin-search)
   - [Indeed search](#indeed-search)
4. [Adding jobs to the site](#adding-jobs-to-the-site)
   - [Setting up an ATS import source (preferred)](#setting-up-an-ats-import-source-preferred)
   - [Creating a manual job](#creating-a-manual-job)
5. [Reviewing pending jobs](#reviewing-pending-jobs)
6. [Keeping manual jobs alive](#keeping-manual-jobs-alive)
7. [Syncing import sources](#syncing-import-sources)
   - [Synchronous sync of one source](#synchronous-sync-of-one-source)
   - [Async sync of many sources at once](#async-sync-of-many-sources-at-once)
8. [Companies](#companies)
9. [News](#news)
10. [Reference: the `'siliconharbour'` module](#reference-the-siliconharbour-module)

---

## What you're maintaining

The site has three primary data types and you can affect all of them:

- **Jobs** — live postings on `siliconharbour.dev/jobs`. Each one is
  either:
  - **Imported** — comes from an ATS scraper (`job_import_sources` row)
    and refreshes itself when you call `syncJobSource(id)`. New postings
    land as `pending_review` until you approve or hide them.
  - **Manual** — created with `createJob`, active immediately, and will
    not refresh on its own. You are responsible for marking them dead
    with `deactivateJob` when their `url` stops resolving.
- **Companies** — directory entries. New companies created with
  `createCompany` start hidden. Most updates use `updateCompany`.
- **News** — community news. Submit links with `submitNewsLink`, hand-author
  with `createNewsArticle`, review with `pendingNews` →
  `approveNews` / `hideNews`.

## Daily routine

A reasonable agent loop looks like:

```js
import {
  pendingJobs,
  getManualJobs,
  listTechNLJobs,
  listAsyncSyncs,
} from 'siliconharbour';

const [pending, manual, technl, recentSyncs] = await Promise.all([
  pendingJobs(),
  getManualJobs(),
  listTechNLJobs(),
  listAsyncSyncs(),
]);

export default {
  pendingReviewCount: pending.length,
  pendingReview: pending.slice(0, 10),
  manualJobsToVerify: manual,
  technlPostings: technl,
  recentSyncs: recentSyncs.slice(0, 5),
};
```

This gives you:

- **`pendingJobs()`** — anything from an ATS that needs an approve / hide
  / approve-non-technical decision. Work the backlog down with
  `reviewJob`. Empty result is normal — most syncs add zero new jobs.
- **`getManualJobs()`** — every active manual job with its URL. Spot-check
  the URLs; anything that 404s or redirects to a generic "no longer
  available" page is a `deactivateJob` candidate.
- **`listTechNLJobs()`** — what's currently on techNL's member job board.
  Each entry tells you whether the company exists in our DB and whether
  it already has an ATS source set up.
- **`listAsyncSyncs()`** — recent background sync runs and their step
  counts. If any sync has `status: "failed"`, drill in with
  `getAsyncSync(runId)`.

## Discovering new jobs

You have three discovery sources. Use them in this order of preference.

### TechNL job board

`listTechNLJobs()` reads the live RSS feed at
`https://technl.ca/?feed=job_feed`. Member companies post here directly,
so it's the highest-signal discovery surface for the NL tech community.

```js
import { listTechNLJobs } from 'siliconharbour';
const jobs = await listTechNLJobs();
export default jobs;
```

Each entry includes a `match` object that tells you exactly what to do:

```json
{
  "title": "Senior Software Developer",
  "company": "NetBenefit Software",
  "location": "St. John's",
  "match": {
    "companyId": 143,           // company exists in our DB
    "companySlug": "netbenefit-software",
    "companyVisible": true,
    "alreadyImported": false,   // job URL not yet in our jobs table
    "matchedJobId": null,
    "matchedJobStatus": null,
    "companyHasJobSource": true // company has an ATS source configured
  }
}
```

Decision tree:

- `alreadyImported: true` → skip. The job is already on the site.
- `companyId === null` → unknown company. Use the agent flow
  ["Companies"](#companies) to add it first.
- `companyHasJobSource: true && !alreadyImported` → the ATS scraper
  exists but didn't pick this posting up. Either the scraper is stale,
  the job is TechNL-exclusive, or the company posted it before the
  scraper ran. Inspect their actual careers page. If the job is real and
  not on the scraper's source, `createJob` it manually.
- `companyHasJobSource: false && companyId !== null` → company is known
  but has no ATS source. The most useful long-term move is to set up an
  ATS source (see [Setting up an ATS import source](#setting-up-an-ats-import-source-preferred)).
  If their careers page has nothing scrape-friendly, fall back to
  `createJob` with the TechNL link as the URL.

To get the full HTML/text description of a single posting before deciding:

```js
import { getTechNLJob } from 'siliconharbour';
const detail = await getTechNLJob(
  'https://technl.ca/job/netbenefit-software-st-johns-full-time-senior-software-developer/',
);
export default detail;
```

### LinkedIn search

`searchLinkedInJobs` searches LinkedIn's public job board. Use it to
discover companies that aren't in our directory and to spot postings from
companies that have an ATS scraper but aren't syncing correctly.

```js
import { searchLinkedInJobs } from 'siliconharbour';

const jobs = await searchLinkedInJobs({
  query: 'software developer engineer',
  location: "St. John's, Newfoundland and Labrador",
  limit: 25,
});

export default jobs.map((j) => ({
  title: j.title,
  companyName: j.companyName,
  location: j.location,
  datePosted: j.datePosted,
  url: j.url,
}));
```

Returns up to `limit` results (default 25). The `url` field is the
LinkedIn job URL — use that as the `url` parameter to `createJob` when
the role is a good fit.

Tips:
- LinkedIn's location filtering is loose. "Greater St. John's Metropolitan
  Area" can include remote workers nominally based in NL — read each
  posting's actual location before importing.
- LinkedIn doesn't include salary on most results.

### Indeed search

`searchIndeedJobs` searches Indeed Canada. Returns heavier payloads
(`description` and `descriptionHtml` for every result), so it's worth
trimming.

```js
import { searchIndeedJobs } from 'siliconharbour';

const jobs = await searchIndeedJobs({
  query: 'software developer',
  location: "St. John's, NL",
  limit: 15,
  hoursOld: 168, // last 7 days
});

export default jobs.map((j) => ({
  title: j.title,
  companyName: j.companyName,
  location: j.location,
  salary: j.salary,
  datePosted: j.datePosted,
  url: j.url,
  directUrl: j.directUrl, // the underlying ATS link if Indeed exposes one
}));
```

Tips:
- `hoursOld` is the freshness filter. Don't pass it to get older results.
- `directUrl` often points at the company's real ATS (Greenhouse, ADP,
  iCIMS, Workday, Njoyn, …). That URL is the fingerprint of which ATS
  the company uses — use it to decide what `sourceType` to pass to
  `createJobSource`.
- Indeed's `query` + `location` filter is restrictive. If a query returns
  zero results, try without `query` and filter the results yourself.

## Adding jobs to the site

### Setting up an ATS import source (preferred)

If a company's careers page is on a supported ATS, set up a source
instead of `createJob`-ing individual postings. The site will then
auto-refresh that company's jobs on every sync.

1. **Check what ATS the company is on.** The `directUrl` field on Indeed
   results, or the apply-button link on their careers page, will tell
   you. Common ATSes are listed in `listImporterTypes()`.

   ```js
   import { listImporterTypes } from 'siliconharbour';
   export default await listImporterTypes();
   ```

2. **Look up the company id.**

   ```js
   import { getCompanyByName } from 'siliconharbour';
   export default await getCompanyByName('GroundControl');
   ```

3. **Create the source.** `createJobSource` validates the config against
   the live ATS before saving, so you'll get a clear error if the slug
   is wrong.

   ```js
   import { createJobSource } from 'siliconharbour';

   const result = await createJobSource({
     companyId: 91,                    // from getCompanyByName
     sourceType: 'rippling',           // one of listImporterTypes()
     sourceIdentifier: 'groundcontrol',// the company's slug on the ATS
     sourceUrl: 'https://ats.rippling.com/groundcontrol/jobs',
   });
   export default result;
   ```

   On success the result includes a `sourceId`. On failure it includes
   an `error` describing what validation hit. Pass `skipValidation: true`
   to bypass validation if you're sure the config is right but the
   validator is flaky.

4. **Run the first sync.**

   ```js
   import { syncJobSource } from 'siliconharbour';
   export default await syncJobSource(47); // the new sourceId
   ```

   Jobs land as `pending_review`. Work them with `reviewJob` (next
   section).

5. **Optional: update an existing source.** If a company changes their
   ATS slug or URL, use `updateJobSource`.

   ```js
   import { updateJobSource } from 'siliconharbour';
   export default await updateJobSource({
     sourceId: 14,
     sourceUrl: 'https://www.netbenefitsoftware.com/careers',
   });
   ```

### Creating a manual job

When there's no scrapable ATS — for example a posting that only exists on
TechNL or that's emailed to a careers@ address — `createJob` lets you put
the posting on the site directly.

```js
import { createJob, getTechNLJob } from 'siliconharbour';

const detail = await getTechNLJob(
  'https://technl.ca/job/netbenefit-software-st-johns-full-time-senior-software-developer/',
);
if (!detail.found) {
  export default { error: 'posting gone from TechNL' };
}

const j = detail.job;
export default await createJob({
  title: j.title,
  description: j.descriptionHtml, // HTML is fine
  url: j.link,                    // the canonical link to apply
  companyName: j.company,         // auto-resolves to companyId
  location: j.location,
  workplaceType: 'onsite',        // remote | onsite | hybrid
  isTechnical: true,              // false flags the job non-technical
});
```

`createJob` returns `{ created, jobId, slug, message }`. The job goes
live immediately as `status: 'active'`, `sourceType: 'manual'`. There
is no review queue for manual jobs.

You can also tweak a manual job later with `updateJob`:

```js
import { updateJob } from 'siliconharbour';
export default await updateJob({
  id: 619,
  location: "St. John's, NL",
  salaryRange: '$90,000 - $110,000',
});
```

## Reviewing pending jobs

Imported jobs sit in `pending_review` until you decide. Three actions:

- **`approve`** — technical role in St. John's NL, or remote in Canada.
- **`approve-non-technical`** — non-technical role (sales, marketing, HR,
  ops, finance, admin) but still NL-connected. Also use for remote
  technical roles that aren't clearly NL-linked. Published but
  deprioritized.
- **`hide`** — not relevant. Hidden from public, won't be reactivated by
  future syncs.

```js
import { pendingJobs, reviewJob } from 'siliconharbour';

const pending = await pendingJobs();
const results = [];
for (const job of pending) {
  // your decision logic here — read job.title, job.location,
  // job.descriptionSnippet, job.workplaceType
  const action = decideAction(job);
  results.push(await reviewJob({ jobId: job.jobId, action }));
}
export default results;
```

Use `getJobDetail(jobId)` if you need the full description text to
decide.

```js
import { getJobDetail } from 'siliconharbour';
export default await getJobDetail(619);
```

**Default lean when uncertain:** prefer `approve-non-technical` over
`hide`. Hiding is permanent — the job won't reappear in `pendingJobs()`
on future syncs even if it's reposted.

Special cases observed in this codebase:

- High-volume non-tech employers like Canadian Blood Services, PAL
  Aerospace, and PAL Airlines should default to `hide` unless the
  role is clearly St. John's tech.

## Keeping manual jobs alive

Manual jobs don't refresh themselves. Walk `getManualJobs()` periodically
and check that each `url` still resolves. If a URL is dead, mark it with
`deactivateJob`. Use the right reason:

- **`removed`** — listing taken down with no indication of why
- **`filled`** — listing closed because the role was filled
- **`expired`** — posting has an explicit "expired" or "no longer
  accepting applications" status

```js
import { getManualJobs, deactivateJob } from 'siliconharbour';

const manual = await getManualJobs();
// You'd do your URL liveness check outside this sandbox (you don't have
// fetch access here). Once you've verified job 619 is dead:
export default await deactivateJob({ jobId: 619, reason: 'filled' });
```

Note: `getManualJobs()` only returns *active* manual jobs. Once
deactivated, they drop out of the list.

## Syncing import sources

### Synchronous sync of one source

For an immediate refresh of a single source:

```js
import { syncJobSource } from 'siliconharbour';
const result = await syncJobSource(47);
export default result;
// { success: true, added, updated, removed, reactivated, totalActive }
```

There's the same for events: `syncEventSource(id)`. Both block until
the sync finishes. Don't use them for "sync everything" — they'll likely
time out and your client will get a stale response.

### Async sync of many sources at once

For broad syncs, use the async variants. They kick off in the background
and return a `runId` you can poll.

```js
import { asyncSyncAllSources, getAsyncSync } from 'siliconharbour';

// Kick off sync of every event source AND every job source
const run = await asyncSyncAllSources();
export default run;
// { id: "abcd-1234-...", status: "running", total: N, completed: 0, ... }
```

Then poll until done:

```js
import { getAsyncSync } from 'siliconharbour';
export default await getAsyncSync('abcd-1234-...');
// {
//   id, status: "running" | "completed" | "failed",
//   total, completed, failed,
//   current: { type, sourceId, name } | undefined,
//   steps: [{ name, status, result, error }, ...]
// }
```

Variants:

- **`asyncSyncAllJobSources()`** — every job source.
- **`asyncSyncAllEventSources()`** — every event source.
- **`asyncSyncAllSources()`** — both.

To see recent runs:

```js
import { listAsyncSyncs } from 'siliconharbour';
export default await listAsyncSyncs();
// Returns the last 20 runs (running and completed). Each item is the
// same shape as getAsyncSync().
```

Common workflow: kick off `asyncSyncAllJobSources()`, wait a few minutes,
then `listAsyncSyncs()` and inspect the most recent run. If any `steps`
entry has `status: "failed"`, the `error` string tells you which source
broke.

## Companies

When TechNL or LinkedIn surface a company you don't recognize, look it
up first:

```js
import { getCompanyByName } from 'siliconharbour';
export default await getCompanyByName('Constellation Dealer Group');
// { found: false, message: '...' } if not in the DB
```

If you need to add one, create it (it starts hidden / `visible: false`
for review):

```js
import { createCompany } from 'siliconharbour';
export default await createCompany({
  name: 'Constellation Dealer Group',
  website: 'https://www.constellation1.com/',
  description: 'Software for automotive dealerships.',
  location: "St. John's, NL",
  email: 'careers@example.com',
});
// { created: true, company: { id, name, slug } }
```

After review, flip it visible (or update other fields) with
`updateCompany`:

```js
import { updateCompany } from 'siliconharbour';
export default await updateCompany({
  id: 442,
  visible: true,
  careersUrl: 'https://www.constellation1.com/careers',
  linkedin: 'https://www.linkedin.com/company/constellation1',
  technl: true, // mark as a TechNL member
});
```

`updateCompany` accepts any subset of: `name`, `website`, `description`,
`location`, `email`, `linkedin`, `github`, `wikipedia`, `careersUrl`,
`founded`, `visible`, `technl`, `genesis`, `bounce`.

## News

The news pipeline mirrors the jobs pipeline.

- **`submitNewsLink({ url, title?, excerpt?, sourceName? })`** — submit
  an external article. Falls into the review queue. If you omit `title`,
  the server fetches the page and extracts metadata.
- **`createNewsArticle({ title, content, excerpt?, publish? })`** — hand
  authored. Pass `publish: true` to skip review and publish immediately.
- **`pendingNews()`** → list awaiting review.
- **`approveNews(id)`** / **`hideNews(id)`** — decide.

```js
import { submitNewsLink } from 'siliconharbour';
export default await submitNewsLink({
  url: 'https://example.com/some-tech-nl-article',
  sourceName: 'Example.com',
});
```

## Reference: the `'siliconharbour'` module

Every callable function. The execute tool exposes all of them. The
read-only `query` tool only exposes the entity-read functions at the
top.

### Read-only (available in `query` and `execute`)

| function | description |
|---|---|
| `events({ upcoming?, limit?, offset? })` | List events |
| `jobs({ query?, limit?, offset? })` | List public-visible jobs |
| `companies({ query?, limit?, offset? })` | List companies |
| `groups({ limit?, offset? })` | List groups |
| `people({ query?, limit?, offset? })` | List people |
| `technologies({ limit?, offset? })` | List technologies |
| `education({ limit?, offset? })` | List education entries |

### Import sources

| function | description |
|---|---|
| `jobImportSources()` | All job ATS sources with status |
| `eventImportSources()` | All event sources with status |
| `createJobSource({ companyId, sourceType, sourceIdentifier, sourceUrl?, skipValidation? })` | Add ATS source (validates against live ATS) |
| `updateJobSource({ sourceId, sourceType?, sourceIdentifier?, sourceUrl? })` | Edit an existing source |
| `createEventSource({ name, sourceType, sourceIdentifier, sourceUrl, organizer? })` | Add event source |
| `listImporterTypes()` | What ATS sourceTypes are supported |

### Syncing

| function | description |
|---|---|
| `syncJobSource(sourceId)` | Sync one source. Blocks until done. |
| `syncEventSource(sourceId)` | Same for events. |
| `syncAllJobSources()` | Blocking sync of every job source. Likely times out. Prefer the async variant. |
| `syncAllEventSources()` | Same for events. |
| `asyncSyncAllJobSources()` | Background sync of every job source. Returns a runId. |
| `asyncSyncAllEventSources()` | Same for events. |
| `asyncSyncAllSources()` | Background sync of both. |
| `getAsyncSync(runId)` | Poll a background run. |
| `listAsyncSyncs()` | Recent (up to 20) runs. |

### Job review

| function | description |
|---|---|
| `pendingJobs()` | All `pending_review` jobs awaiting decisions. |
| `getJobDetail(jobId)` | Full description text for an imported job. |
| `reviewJob({ jobId, action })` | `action`: `approve` \| `approve-non-technical` \| `hide` |
| `pendingEvents()` | Same for events. |

### Manual jobs

| function | description |
|---|---|
| `createJob({ title, description, url, companyName?, companyId?, location?, department?, workplaceType?, salaryRange?, isTechnical? })` | Active immediately. |
| `getManualJobs()` | All active manually-created jobs with URLs for liveness checking. |
| `updateJob({ id, title?, description?, url?, location?, department?, workplaceType?, salaryRange? })` | Edit a job (manual or imported). |
| `deactivateJob({ jobId, reason })` | `reason`: `removed` \| `filled` \| `expired` |

### Companies

| function | description |
|---|---|
| `getCompanyByName(name)` | Look up by name. |
| `createCompany({ name, website?, description?, location?, email? })` | Creates hidden, pending review. |
| `updateCompany({ id, name?, website?, description?, location?, email?, linkedin?, github?, wikipedia?, careersUrl?, founded?, visible?, technl?, genesis?, bounce? })` | Edit a company. |

### Discovery

| function | description |
|---|---|
| `listTechNLJobs()` | techNL job board with company-match info. |
| `getTechNLJob(link)` | Full description for one TechNL posting. |
| `searchIndeedJobs({ query?, location?, limit?, hoursOld? })` | Indeed Canada search. |
| `searchLinkedInJobs({ query?, location?, limit? })` | LinkedIn public job search. |

### News

| function | description |
|---|---|
| `submitNewsLink({ url, title?, excerpt?, sourceName? })` | Submit external article (fetches metadata if title omitted). |
| `createNewsArticle({ title, content, excerpt?, publish? })` | Hand authored. |
| `pendingNews()` | Awaiting review. |
| `approveNews(id)` / `hideNews(id)` | Decide. |

---

## A few practical notes

- **Timeout:** the `execute` sandbox is capped at 60 seconds, the `query`
  sandbox at 10 seconds. If something might take longer (a full sync),
  use the `async*` variants and poll with `getAsyncSync`.
- **No network:** `fetch`, `node:fs`, `process.env`, and other host
  primitives are deliberately disabled inside the sandbox. The only
  external calls allowed are the ones explicitly bound in the
  `'siliconharbour'` module.
- **`'siliconharbour'` is virtual:** there's no `node_modules` entry to
  inspect. Treat it as a fixed surface area documented here.
- **Be conservative about hiding jobs:** `hide` blocks the same job from
  ever reappearing on resync. When uncertain, prefer
  `approve-non-technical`.
- **Manual jobs are forever your responsibility.** Every job created
  with `createJob` will sit on the site indefinitely until you call
  `deactivateJob`. Periodically walk `getManualJobs()`.
