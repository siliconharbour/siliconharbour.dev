---
id: s-fa82
status: in_progress
deps: []
links: []
created: 2026-05-29T00:23:00Z
type: feature
priority: 2
assignee: Jack Arthur Harrhy
tags: [importer, github]
---
# Improve GitHub-by-location importer: drop 'NL' term, add NL towns & filters

Last bulk import filled with Netherlands users because location:"NL" was too broad (5140 results, almost all Amsterdam/Hague/Rotterdam). Cleaned up via blocklist (1372 entries) but want to prevent recurrence and improve coverage of actual NL towns before re-running.

Changes:
1. Drop bare "NL" term from NEWFOUNDLAND_LOCATION_TERMS
2. Add quoted NL town terms with low noise: "St. John's", "Corner Brook", "Mount Pearl", "Gander", "Paradise, NL", "Carbonear", "Bonavista", "Conception Bay"\n3. Skip noisy terms: "Stephenville" (Texas dominates), "MUN" (Hong Kong/Beijing), "Happy Valley" (Oregon), "Memorial University" (India)\n4. Add post-fetch location filter: GitHub search is substring-based and noisy. After fetching full profile in importSingleUser, verify location string actually looks like NL before importing.\n5. Default new imports to blocked when location does not match (rather than just hidden) - safer fallback

## Acceptance Criteria

- "NL" alone removed from NEWFOUNDLAND_LOCATION_TERMS
- New high-signal town terms added
- Post-fetch location validation rejects obvious non-NL profiles
- Existing 1004 imported people and 1372 blocklist entries untouched
- Build + lint pass
- Tested locally before pushing to prod

