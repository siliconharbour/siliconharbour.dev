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
  posted_at INTEGER,
  external_updated_at INTEGER,
  first_seen_at INTEGER,
  last_seen_at INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER,
  UNIQUE(source_id, external_id)
);

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
