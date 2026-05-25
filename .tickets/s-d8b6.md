---
id: s-d8b6
status: closed
deps: []
links: []
created: 2026-05-25T02:27:43Z
type: feature
priority: 1
assignee: Jack Arthur Harrhy
---
# Expose recurrence info in /api/events and /api/events/:slug

Recurring events with no explicit event_dates rows (cts-nl-meetup, ai-builders-nl, 10am-mun) appear in the API with dates: [] and no temporal info at all. Add a 'recurrence' field to the event API mapper that exposes the raw RRULE, series start/end, default start/end times, and a human-readable description from describeRecurrenceRule(). Applies to both list and detail endpoints. Non-recurring events get recurrence: null.

## Acceptance Criteria

TDD: failing tests first. Both endpoints emit recurrence block for recurring events and null otherwise. Shared mapper helper. pnpm test + build + lint pass.

