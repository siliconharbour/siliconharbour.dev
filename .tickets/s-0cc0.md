---
id: s-0cc0
status: closed
deps: []
links: []
created: 2026-04-11T14:35:15Z
type: bug
priority: 2
assignee: Jack Arthur Harrhy
---
# Fix broken favicon and og:image for homepage

No <link rel=icon> in HTML head, and og:image points to SVG which social platforms cannot render. Need to: 1) Add explicit favicon link tags to root.tsx 2) Create a site-og.png route for default OG image 3) Update DEFAULT_OG_IMAGE in seo.ts to use PNG endpoint

