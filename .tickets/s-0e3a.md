---
id: s-0e3a
status: closed
deps: []
links: []
created: 2026-02-12T04:12:19Z
type: bug
priority: 1
assignee: Jack Arthur Harrhy
tags: [jobs, importer, workday, verafin]
---
# Add manual Workday ingest fallback for Verafin source

Cloudflare blocks server-side Workday fetch for nasdaq:Global_External_Site:verafin. Add special-case UI on /manage/import/jobs/3 with browser-console extraction script + pasted JSON ingestion, while keeping normal Workday sync path intact.

