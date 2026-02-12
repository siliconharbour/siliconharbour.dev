---
id: s-b33f
status: closed
deps: []
links: []
created: 2026-02-12T03:57:47Z
type: bug
priority: 1
assignee: Jack Arthur Harrhy
tags: [jobs, scraper, aker]
---
# Fix Aker Solutions title parsing regression

Aker Solutions scraper is emitting title strings with concatenated location/position/deadline text, causing duplicate pending_review jobs instead of matching existing removed jobs.

