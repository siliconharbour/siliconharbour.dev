---
id: s-3e4a
status: closed
deps: []
links: []
created: 2026-06-11T03:02:26Z
type: bug
priority: 2
assignee: Jack Arthur Harrhy
tags: [mcp, consolidation]
---
# MCP union surface gaps: getEntity/updateEntity/listEntities missing types

Discovered while wiring up TechNest on prod: getEntity rejected type:'event'. Audit of all five entity-CRUD unions:

| Union | Missing types |
|---|---|
| createEntity (14) | — |
| updateEntity (8) | event, group, news, news-source, event-source |
| deleteEntity (12) | — |
| getEntity (9) | event, event-source, job-source, news-source |
| listEntities (8) | event-source, job-source, news-source |

These are oversights from s-5c98 consolidation — if you can create+delete an event-source, you should be able to look it up + update it too.

## Fix

1. Extend GET_ENTITY_TYPES + getEntity dispatch:
   - event -> getEventById / getEventBySlug
   - event-source -> getEventImportSourceById
   - job-source -> getSourceById (already imported as getSourceById from job-importers)
   - news-source -> getNewsSourceById (already imported)
2. Extend UpdateEntitySchema discriminated union + updateEntity dispatch:
   - event -> updateEvent (lib/events.server.ts)
   - group -> updateGroup (lib/groups.server.ts)
   - news -> updateNews (lib/news.server.ts)
   - news-source -> updateNewsImportSource (lib/news-importers/sync.server.ts)
   - event-source -> updateEventImportSource (lib/event-importers/sync.server.ts)
3. Extend listEntities 'all' branch to dispatch event-source/job-source/news-source to the existing eventImportSources()/jobImportSources()/newsImportSources() functions.
4. Add tests in bridge-union-dispatch.test.ts covering the new branches.

## Verification

- Pre-fix, getEntity({ type:'event', by:'id', value:204 }) errors on prod (witnessed during TechNest wiring).
- Post-fix, every type listed in createEntity is also reachable via getEntity (excluding news-article/news-link which aren't standalone lookups).
- All quality gates pass.

