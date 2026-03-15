---
id: s-fbf0
status: closed
deps: []
links: []
created: 2026-03-15T17:30:01Z
type: bug
priority: 1
assignee: Jack Arthur Harrhy
tags: [og, events, validation]
---
# Fix OG image backwards date range and add end-before-start validation

OG image showed March 19 -> March 15 because last date had endDate before startDate (data entry error). Fixed OG code to use Math.max across all dates for range end. Added EventForm validation: end date DayPicker disables dates before start, red border + warning when end is before start.

