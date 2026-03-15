---
id: s-cad6
status: closed
deps: []
links: []
created: 2026-03-15T14:34:58Z
type: bug
priority: 1
assignee: Jack Arthur Harrhy
tags: [recurrence, timezone]
---
# Fix recurring event day-of-week off-by-one on UTC servers

Recurring events show one day early on production (UTC server). Root cause: generateOccurrences uses server-local Date methods (getDay, setHours) which on a UTC server interpret midnight-UTC timestamps as the previous Newfoundland calendar day. Fix: convert anchor to noon UTC of the Newfoundland day before arithmetic, use UTC date methods throughout.

