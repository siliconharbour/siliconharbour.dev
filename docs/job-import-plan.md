# Job Import Modules - High Level Plan

## Overview

We want to pull job postings from company career pages to:
1. Import jobs into our job listings
2. Extract technologies mentioned in job descriptions for provenance tracking
3. Track when data was fetched and keep historical records

## ATS Platforms Identified

### 1. Greenhouse (CoLab Software)
- **Example**: https://www.colabsoftware.com/careers → job-boards.greenhouse.io/colabsoftware
- **API**: Public JSON API, no auth required for reading
- **Endpoint**: `https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true`
- **Data Available**:
  - Job title, location, department
  - Full HTML job description (with `?content=true`)
  - Last updated timestamp
  - Direct application URL
- **Board Token**: Extract from company career page (e.g., "colabsoftware")

### 2. Ashby (Spellbook)
- **Example**: https://www.spellbook.legal/careers → jobs.ashbyhq.com/spellbook.legal
- **API**: Job data embedded in page `__appData` JSON blob
- **Endpoint**: `https://jobs.ashbyhq.com/{org_slug}` - scrape `window.__appData`
- **Data Available**:
  - Job title, location, department/team
  - Job posting ID, workplace type (Remote/OnSite)
  - Published date, updated timestamp
  - Need separate fetch for full job description
- **Org Slug**: Extract from career page embed URL

### 3. Workday (Verafin/Nasdaq)
- **Example**: https://verafin.com/careers/ → nasdaq.wd1.myworkdayjobs.com/Global_External_Site?q=verafin
- **API**: Public JSON API via Workday
- **Endpoint**: Complex - need to use Workday's job search API with company filter
- **Data Available**:
  - Job title, location
  - Job description
  - Application link
- **Complexity**: Higher - requires understanding Workday's search API

### 4. BambooHR (Trophi)
- **Example**: https://www.trophi.ai/careers → trophiai.bamboohr.com/careers
- **API**: BambooHR has a public careers page with embedded JSON
- **Endpoint**: `https://{subdomain}.bamboohr.com/careers/list`
- **Data Available**:
  - Job title, location, department
  - Job description
  - Application link

### 5. Custom/Direct HTML Scraping
- For companies without standard ATS
- Parse careers page HTML directly
- Higher maintenance, more brittle

## Database Schema

```sql
-- Track job import sources per company
CREATE TABLE job_import_sources (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  source_type TEXT NOT NULL, -- 'greenhouse', 'ashby', 'workday', 'bamboohr', 'custom'
  source_identifier TEXT NOT NULL, -- board token, org slug, etc.
  source_url TEXT, -- the careers page URL
  last_fetched_at INTEGER,
  fetch_status TEXT, -- 'success', 'error', 'pending'
  fetch_error TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

-- Track individual job postings fetched
-- Uses soft deletes: jobs are never hard-deleted, just marked inactive
CREATE TABLE imported_jobs (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  source_id INTEGER REFERENCES job_import_sources(id),
  external_id TEXT NOT NULL, -- ID from the ATS
  title TEXT NOT NULL,
  location TEXT,
  department TEXT,
  description_html TEXT, -- raw HTML
  description_text TEXT, -- extracted plain text
  url TEXT, -- application URL
  workplace_type TEXT, -- remote, onsite, hybrid
  posted_at INTEGER, -- when the company posted it (from ATS)
  external_updated_at INTEGER, -- last update timestamp from ATS
  first_seen_at INTEGER NOT NULL, -- when we first discovered this job
  last_seen_at INTEGER NOT NULL, -- last time job appeared in fetch
  removed_at INTEGER, -- when job disappeared from ATS (null = still active)
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'removed', 'filled', 'expired'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(source_id, external_id)
);

-- Index for common queries
CREATE INDEX imported_jobs_status_idx ON imported_jobs(status);
CREATE INDEX imported_jobs_company_idx ON imported_jobs(company_id);
CREATE INDEX imported_jobs_removed_idx ON imported_jobs(removed_at) WHERE removed_at IS NOT NULL;

-- Track technology extraction from job descriptions
CREATE TABLE job_technology_mentions (
  id INTEGER PRIMARY KEY,
  imported_job_id INTEGER REFERENCES imported_jobs(id),
  technology_id INTEGER REFERENCES technologies(id),
  confidence REAL, -- 0-1 score
  context TEXT, -- snippet where tech was mentioned
  created_at INTEGER
);
```

## Module Architecture

```
app/lib/job-importers/
├── types.ts           -- Shared types
├── base.ts            -- Base importer class
├── greenhouse.ts      -- Greenhouse API
├── ashby.ts           -- Ashby scraper
├── workday.ts         -- Workday API
├── bamboohr.ts        -- BambooHR API
└── index.ts           -- Registry & factory

app/routes/manage/import/
├── jobs.tsx           -- Main jobs import dashboard
├── jobs.$sourceId.tsx -- View/manage specific source
└── jobs.run.tsx       -- Action to trigger import
```

## Module Interface

```typescript
interface JobImporter {
  // Fetch all jobs from source
  fetchJobs(config: ImportSourceConfig): Promise<ImportedJob[]>;
  
  // Fetch single job details (if needed)
  fetchJobDetails?(jobId: string, config: ImportSourceConfig): Promise<JobDetails>;
  
  // Validate configuration
  validateConfig(config: ImportSourceConfig): Promise<ValidationResult>;
  
  // Get source type identifier
  readonly sourceType: string;
}

interface ImportedJob {
  externalId: string;
  title: string;
  location?: string;
  department?: string;
  descriptionHtml?: string;
  descriptionText?: string;
  url: string;
  workplaceType?: 'remote' | 'onsite' | 'hybrid';
  postedAt?: Date;
  updatedAt?: Date;
}
```

## Import Sync Logic

Each import run follows this algorithm:

```typescript
async function syncJobs(sourceId: number): Promise<SyncResult> {
  const source = await getSourceById(sourceId);
  const importer = getImporter(source.sourceType);
  
  // 1. Fetch current jobs from ATS
  const fetchedJobs = await importer.fetchJobs(source);
  const fetchedIds = new Set(fetchedJobs.map(j => j.externalId));
  
  // 2. Get our existing jobs for this source
  const existingJobs = await getJobsBySourceId(sourceId);
  const existingIds = new Set(existingJobs.map(j => j.externalId));
  
  const now = Date.now();
  const results = { added: 0, updated: 0, removed: 0, reactivated: 0 };
  
  // 3. Process fetched jobs
  for (const job of fetchedJobs) {
    const existing = existingJobs.find(j => j.externalId === job.externalId);
    
    if (!existing) {
      // NEW JOB: insert with first_seen_at = now
      await insertJob({ ...job, sourceId, firstSeenAt: now, lastSeenAt: now, status: 'active' });
      results.added++;
    } else if (existing.status !== 'active') {
      // REACTIVATED: job came back after being removed
      await updateJob(existing.id, { ...job, lastSeenAt: now, removedAt: null, status: 'active' });
      results.reactivated++;
    } else {
      // EXISTING: update last_seen_at and any changed fields
      await updateJob(existing.id, { ...job, lastSeenAt: now });
      results.updated++;
    }
  }
  
  // 4. Mark jobs no longer in feed as removed
  for (const existing of existingJobs) {
    if (existing.status === 'active' && !fetchedIds.has(existing.externalId)) {
      await updateJob(existing.id, { removedAt: now, status: 'removed' });
      results.removed++;
    }
  }
  
  // 5. Update source metadata
  await updateSource(sourceId, { lastFetchedAt: now, fetchStatus: 'success' });
  
  return results;
}
```

### Job Lifecycle States

| Status | Meaning | `removed_at` |
|--------|---------|--------------|
| `active` | Currently on company's career page | `null` |
| `removed` | Disappeared from feed (may be filled or pulled) | timestamp |
| `filled` | Manually marked as filled | timestamp |
| `expired` | Job had an expiration date that passed | timestamp |

### Useful Queries

```sql
-- Active jobs for a company
SELECT * FROM imported_jobs WHERE company_id = ? AND status = 'active';

-- Recently removed jobs (last 30 days)
SELECT * FROM imported_jobs 
WHERE status = 'removed' 
AND removed_at > unixepoch('now', '-30 days');

-- Jobs that came back (reactivated)
SELECT * FROM imported_jobs 
WHERE status = 'active' 
AND removed_at IS NOT NULL; -- was previously removed

-- Job posting duration (how long was it live?)
SELECT title, 
       (COALESCE(removed_at, unixepoch()) - first_seen_at) / 86400 as days_posted
FROM imported_jobs 
WHERE company_id = ?;

-- Historical archive: all jobs we've ever seen
SELECT * FROM imported_jobs WHERE company_id = ? ORDER BY first_seen_at DESC;
```

## Implementation Priority

1. **Greenhouse** (easiest - clean API, CoLab uses it)
2. **Ashby** (embedded JSON, Spellbook uses it) 
3. **BambooHR** (similar pattern, Trophi uses it)
4. **Workday** (more complex, Verafin uses it)
5. **Custom HTML** (fallback for edge cases)

## Admin UI Flow

1. **Add Import Source**
   - Select company
   - Choose source type
   - Enter identifier (auto-detect if possible from company website)
   - Validate & save

2. **Import Dashboard**
   - List all configured sources
   - Show last fetch time, status, job count
   - Manual "Fetch Now" button
   - Auto-fetch scheduling (cron)

3. **Job Review**
   - View imported jobs per source
   - Option to publish to main jobs listing
   - Technology extraction preview

## Technology Extraction

After importing jobs, we can:
1. Search job description text for known technologies
2. Use simple pattern matching first (tech name + common variations)
3. Later: Add NLP/AI extraction for better accuracy
4. Store mentions with confidence scores
5. Use as provenance for company technology assignments

## Next Steps

1. Create database migrations for new tables
2. Implement Greenhouse module first
3. Build basic admin UI for managing sources
4. Add manual import trigger
5. Test with CoLab's Greenhouse board
6. Iterate on other modules
