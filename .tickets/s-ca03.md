---
id: s-ca03
status: closed
deps: [s-0bd7]
links: []
created: 2026-02-06T20:50:13Z
type: task
priority: 2
assignee: Jack Arthur Harrhy
parent: s-6b74
---
# Technology extraction from job descriptions

Create app/lib/job-importers/tech-extractor.server.ts - pattern matching to find technology mentions in job description text. Store in job_technology_mentions table.

## Acceptance Criteria

- Extracts known technologies from description
- Uses pattern matching (tech name + variations)
- Stores mentions with context snippet
- Confidence score based on match quality
- Can be run on existing imported jobs

