# Importer Parsing Standards

## Goal
Keep importer parsing predictable and maintainable by using DOM-based parsing for HTML pages.

## Rules
- Use `linkedom` (`parseHTML`) for HTML structure extraction.
- Prefer selectors (`querySelector`, `querySelectorAll`) over large regex captures.
- Keep regex for narrow, stable patterns only:
  - Embedded script payload extraction (`__NEXT_DATA__`, `window.__appData`)
  - Small text normalizations
- Avoid regex that attempts to parse nested HTML blocks.

## Shared Helpers
- Use `app/lib/job-importers/custom/utils.ts`:
  - `parseHtmlDocument(html)`
  - `getNodeText(node)`
  - `htmlToText(html)`

## Implementation Pattern
1. Fetch HTML.
2. Parse document with `parseHtmlDocument`.
3. Select job containers with specific selectors.
4. Extract fields from child nodes (title, location, link, description).
5. Normalize and validate output.

## Safety Checks
- Skip entries with missing title or ID.
- Deduplicate by stable `externalId`.
- Keep fallback URL when job-specific URL is unavailable.

## Validation Expectations
- For each importer refactor, verify:
  - job count is non-zero on known active pages,
  - titles are non-empty,
  - IDs remain stable between runs for unchanged jobs.
