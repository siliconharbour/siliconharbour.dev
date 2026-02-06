---
id: s-38bd
status: closed
deps: []
links: []
created: 2026-02-06T23:11:47Z
type: feature
priority: 2
assignee: Jack Arthur Harrhy
parent: s-c427
tags: [custom-importer]
---
# Custom importer: SiftMed

Build custom career page scraper for SiftMed (Wix). URL: https://www.siftmed.ca/jobs. DB company ID: 191. Wix uses internal APIs (/_api/ or /_serverless/) that serve JSON data. Needs network request investigation.


## Notes

**2026-02-06T23:13:15Z**

Wix uses client-side rendering - jobs content loaded via JS APIs. Not feasible to scrape server-side without headless browser.
