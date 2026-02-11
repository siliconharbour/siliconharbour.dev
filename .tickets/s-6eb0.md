---
id: s-6eb0
status: closed
deps: []
links: []
created: 2026-02-11T20:44:56Z
type: bug
priority: 1
assignee: Jack Arthur Harrhy
tags: [og, events, timezone]
---
# Fix event OG image timezone rendering

Event open-graph image date text is rendered in server locale/timezone instead of site timezone (America/St_Johns), causing incorrect times (e.g. 6:00 PM shows as 9:30 PM). Update OG generation to use timezone-aware formatting consistent with event pages/cards.

