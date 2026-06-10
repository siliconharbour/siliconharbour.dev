---
id: s-9fb2
status: in_progress
deps: []
links: []
created: 2026-06-10T17:33:43Z
type: bug
priority: 2
assignee: Jack Arthur Harrhy
tags: [ui, events]
---
# Show publish/unpublish on manage event edit page for any non-published status

Reported: created an event via MCP createEvent, went to /manage/events/203/, no publish button visible. The button is gated on importStatus === 'approved' but our createEvent sets importStatus = 'pending_review' (correct per s-aafe followup).

Also: there's no unpublish path on this page at all — once an event is published you have no way to take it back here.

Fix:
- Show Save & Publish whenever importStatus is not null and not 'published' (covers pending_review, approved, hidden).
- Show Save & Unpublish when importStatus is 'published'. Sets it back to 'hidden'.
- Generalize the amber banner copy so it doesn't say 'imported' (manual events aren't imported).
- Fix createEvent's success message that points to /manage/events/{id}/edit — the real URL is /manage/events/{id}.

