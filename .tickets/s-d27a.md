---
id: s-d27a
status: closed
deps: []
links: []
created: 2026-02-07T21:38:22Z
type: task
priority: 2
assignee: Jack Arthur Harrhy
tags: [refactor, ui, admin]
---
# Audit CRUD/admin patterns for DRY opportunities

Analyze TypeScript codebase for repeated CRUD patterns and shared UI/util opportunities, then propose prioritized cleanup list for sign-off before implementation.


## Notes

**2026-02-07T21:39:30Z**

Initial audit complete: manage area has ~13.3k LOC, 46 actions, 57 loaders, and 290 formData.get calls. Strong duplication across new/edit/delete routes for 10 entities; repeated form markup, parsing/validation, and list-card UIs. User requested Zod-first parsing/validation strategy.
