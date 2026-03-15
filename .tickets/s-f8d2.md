---
id: s-f8d2
status: closed
deps: []
links: []
created: 2026-03-15T14:59:36Z
type: bug
priority: 2
assignee: Jack Arthur Harrhy
tags: [images, events]
---
# Fix event cover image aspect ratio mismatch in crop vs display

Event covers cropped at 3:1 client-side but server processAndSaveCoverImage used fit:cover with 1200x630 (~1.9:1), distorting the image. Form preview and featured card also used wrong aspect ratios. Fix: server uses fit:inside to preserve crop ratio, form preview and featured card use aspect-[3/1].

