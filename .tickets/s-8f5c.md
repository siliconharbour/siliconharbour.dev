---
id: s-8f5c
status: closed
deps: []
links: []
created: 2026-05-07T22:03:28Z
type: bug
priority: 0
assignee: Jack Arthur Harrhy
---
# Fix events pagination showing wrong total count

The total count for pagination is computed from filteredEventIds.length (line 570) before the importStatus filter (line 610) removes non-published events. This means pagination thinks there are more items than actually exist, showing multiple pages when there's only 1 page of real results.

