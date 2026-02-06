# Custom Career Page Importers

We have ATS importers for Greenhouse, Ashby, Workday, BambooHR, Lever, Collage,
and Rippling. The remaining companies use custom career pages that need per-site
or per-platform scrapers.

## Architecture

Custom importers use the existing `custom` source type and the same `JobImporter`
interface. The `sourceIdentifier` is a unique key for each custom scraper (e.g.,
the company slug). A single `custom.server.ts` file can dispatch to per-company
scraper functions based on the identifier.

```
app/lib/job-importers/custom.server.ts     # dispatcher
app/lib/job-importers/custom/              # per-company scrapers
  strobeltek.ts
  c-core.ts
  rutter.ts
  ...
```

The `sourceIdentifier` for custom sources is the company slug. The dispatcher
looks up the right scraper function and calls it.

---

## WordPress Sites (5 companies)

These are all WordPress sites. Job listings are embedded in page content, often
as styled sections or individual post links. WordPress sites expose `wp-json`
REST API which sometimes has job data in custom post types.

### StrobelTEK

- **URL:** https://strobeltek.com/careers/
- **Platform:** WordPress (Avada theme)
- **Structure:** Job titles as headings with descriptions inline. Apply links
  go to individual job pages at `/careers-2/` with title slugs.
- **DB company ID:** 203
- **Approach:** Fetch `/careers/` HTML, parse job blocks from content. Check
  for WP REST API custom post types at `/wp-json/wp/v2/`.

### C-CORE

- **URL:** https://c-core.ca/working-at-c-core/
- **Platform:** WordPress
- **Structure:** "Active Searches" section with links to individual WordPress
  pages for each job. Each job page has full description.
- **DB company ID:** 38
- **Approach:** Fetch careers page, extract links under "Active Searches" heading.
  Follow each link to get job title and description from the page content.

### Rutter

- **URL:** https://rutter.ca/careers/
- **Platform:** WordPress (Divi theme)
- **Structure:** Job listings as Divi blurb modules with titles and descriptions.
- **DB company ID:** 184 / 281
- **Approach:** Parse Divi blurb modules from careers page HTML. Each blurb
  contains a job title and summary.

### Enaimco

- **URL:** https://enaimco.com/careers/
- **Platform:** WordPress
- **Structure:** "Available Positions" section. Currently 0 openings.
- **DB company ID:** 68
- **Approach:** Parse careers page for job listings under positions section.
  Low priority - no current openings.

### Triware Technologies

- **URL:** https://triware.ca/careers/
- **Platform:** WordPress
- **Structure:** Job listings on careers page.
- **DB company ID:** 217
- **Approach:** Parse WordPress careers page content for job listings.

---

## Webflow Sites (2 companies)

Webflow sites are static HTML with clean semantic markup. No API, but the HTML
is predictable and easy to parse.

### NetBenefit Software

- **URL:** https://www.netbenefitsoftware.com/careers
- **Platform:** Webflow
- **Structure:** Job titles with PDF links to full descriptions hosted on
  Webflow CDN. Apply via email.
- **DB company ID:** 143
- **Approach:** Parse page for job title elements and PDF links. Extract job
  title from the heading, URL from the PDF link.

### PolyUnity

- **URL:** https://www.polyunity.com/work-with-us
- **Platform:** Webflow
- **Structure:** General "join us" page without structured job listings.
- **DB company ID:** 167
- **Approach:** Low priority. May not have parseable job data. Skip unless
  they add structured listings.

---

## Squarespace Sites (1 company)

### Virtual Marine

- **URL:** https://www.virtualmarine.ca/careers
- **Platform:** Squarespace
- **Structure:** Job listings with `mailto:careers@virtualmarine.ca` links
  that include the job title in the subject line.
- **DB company ID:** 227 / 297
- **Approach:** Parse page for mailto links with job titles in subject params.
  Each mailto subject is the job title (e.g., "Application: Game Developer").

---

## HubSpot Sites (1 company)

### ClearRisk

- **URL:** https://www.clearrisk.com/about-clearrisk/careers
- **Platform:** HubSpot CMS
- **Structure:** Career page built in HubSpot. Job listings embedded in page
  modules.
- **DB company ID:** 43
- **Approach:** Parse HubSpot page HTML for job listing content blocks.

---

## Wix Sites (1 company)

### SiftMed

- **URL:** https://www.siftmed.ca/jobs
- **Platform:** Wix
- **Structure:** Wix built-in jobs feature. Wix sites use internal APIs that
  serve JSON data to the client.
- **DB company ID:** 191
- **Approach:** Investigate Wix internal API endpoints. Wix jobs typically
  load data via `/_api/` or `/_serverless/` endpoints. May need to inspect
  network requests to find the JSON source.

---

## Liferay CMS (1 company)

### Compusult

- **URL:** https://www.compusult.com/web/guest/careers
- **Platform:** Liferay CMS
- **Structure:** Heavy enterprise CMS framework. Job content may be in Liferay
  web content articles.
- **DB company ID:** 48
- **Approach:** Challenging. Liferay renders content server-side but the HTML
  structure is complex. Parse the rendered HTML for job listing blocks.

---

## Other Custom Sites

### Focus FS

- **URL:** https://focusfs.com/company/careers/
- **DB company ID:** 79
- **Approach:** Parse careers page HTML for job listings.

### Oliver POS

- **URL:** https://oliverpos.com/company/careers/
- **DB company ID:** 271
- **Approach:** Parse careers page HTML for job listings.

### Bluedrop ISM

- **URL:** https://bluedropism.com/careers/#jobs
- **DB company ID:** 27
- **Approach:** Parse careers page HTML for job listings.

---

## Priority Order

1. **StrobelTEK** - WordPress, active postings, tech company
2. **C-CORE** - WordPress, active postings, known structure
3. **Virtual Marine** - Squarespace, simple mailto parsing
4. **NetBenefit Software** - Webflow, active postings
5. **Rutter** - WordPress, tech company
6. **ClearRisk** - HubSpot, tech company
7. **Compusult** - Liferay, harder to scrape
8. **SiftMed** - Wix, needs API investigation
9. **Others** - As needed

## Implementation Notes

- All custom scrapers implement the same `JobImporter` interface
- Use `custom` as the `sourceType` in `job_import_sources`
- The `sourceIdentifier` is the company slug (e.g., `strobeltek`)
- A dispatcher in `custom.server.ts` routes to per-company scrapers
- Each scraper is a simple function: `(config) => Promise<FetchedJob[]>`
- HTML parsing uses regex (same as Collage importer) - no extra dependencies
- Custom scrapers are inherently fragile; they break when sites redesign
