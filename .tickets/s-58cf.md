---
id: s-58cf
status: closed
deps: []
links: []
created: 2026-02-07T04:41:04Z
type: bug
priority: 1
assignee: Jack Arthur Harrhy
tags: [ui, provenance, jobs]
---
# Fix company sources dialog dedupe for same-URL jobs

Technology Sources dialog currently dedupes evidence jobs by URL, collapsing distinct jobs that share a careers page URL. Deduplicate by job identity (title+url) so all supporting jobs are shown.

