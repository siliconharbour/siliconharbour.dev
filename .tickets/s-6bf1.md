---
id: s-6bf1
status: closed
deps: []
links: []
created: 2026-02-07T04:59:41Z
type: bug
priority: 1
assignee: Jack Arthur Harrhy
tags: [jobs, importers, text]
---
# Fix encoded HTML tags leaking into job description_text

Shared job HTML-to-text conversion currently strips tags before decoding entities, which allows encoded tags like &lt;p&gt; to survive into description_text. Decode and normalize in the correct order so both raw and encoded tags are removed.

