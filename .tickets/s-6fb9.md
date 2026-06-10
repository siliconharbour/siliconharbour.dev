---
id: s-6fb9
status: in_progress
deps: []
links: []
created: 2026-06-10T20:01:11Z
type: feature
priority: 2
assignee: Jack Arthur Harrhy
tags: [mcp, groups]
---
# Add createGroup + getGroupBySlug MCP host functions

## Why

User wants to create a TechNest group on prod to associate the upcoming TEA in the Park eventbrite source with. Existing createCompany pattern is the obvious template, but createGroup isn't exposed via MCP yet.

## What

1. Add createGroup({ name, description, website?, meetingFrequency?, visible? }) — calls existing lib/groups.server.ts createGroup. Defaults visible=false (hidden, pending review) matching the createCompany convention. Pass visible=true to publish immediately.
2. Add getGroupBySlug(slug) for lookup parity with getCompanyByName.
3. Wrap both with host() so /api page picks them up automatically.

## Acceptance

- createGroup creates a hidden group with a unique slug.
- getGroupBySlug returns the group or { found:false } shape matching getCompanyByName.
- /api page auto-lists both under execute -> creation/lookup categories.
- build/lint/tests pass.

