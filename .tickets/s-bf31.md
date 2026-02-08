---
id: s-bf31
status: closed
deps: []
links: []
created: 2026-02-08T01:45:20Z
type: task
priority: 1
assignee: Jack Arthur Harrhy
parent: s-1ee6
tags: [refactor, directory, loader]
---
# Refactor directory detail loader pattern

Extract shared directory detail loader helper for admin/comments/turnstile/references/backlinks pattern.


## Notes

**2026-02-08T01:58:02Z**

Added /app/lib/directory-page.server.ts and migrated directory detail loaders (companies/groups/products/projects/education) to shared common data loader for admin/comments/references/backlinks/turnstile.
