# Admin Pages Responsive Design Fix

## Problem

The `/manage` admin pages have no responsive design consideration. Tables are clipped or overflow the viewport, form grids create unusably narrow inputs, and header action buttons overflow on mobile. The import pages are the worst -- the job import source detail page has 5+ tables all using `overflow-hidden` which silently clips content.

## Scope

Fix all known responsive issues across ~15 admin pages. No layout refactors or new components -- targeted Tailwind class changes on existing elements.

## Fix Patterns

### Pattern A: Table overflow

**Problem:** Table wrappers use `overflow-hidden`, clipping right-side columns (actions, status) on mobile.

**Fix:** Change `overflow-hidden` to `overflow-x-auto` on all table wrapper divs.

**Affected files:**
- `app/routes/manage/import/jobs.tsx` (1 table)
- `app/routes/manage/import/events.tsx` (1 table)
- `app/routes/manage/import/jobs.$sourceId.tsx` (5 tables: technology preview, pending review, active jobs, hidden jobs, removed jobs)

### Pattern B: Form grid breakpoints

**Problem:** `grid grid-cols-2` used without responsive prefix, creating ~148px-wide inputs on 320px screens.

**Fix:** Change `grid-cols-2` to `grid-cols-1 md:grid-cols-2` on form field rows.

**Affected files:**
- `app/routes/manage/companies/new.tsx` (Location/Founded row)
- `app/routes/manage/companies/edit.tsx` (same)
- `app/routes/manage/jobs/new.tsx` (Location/Department, Workplace Type/Salary Range)
- `app/routes/manage/jobs/edit.tsx` (same)

### Pattern C: Page header wrapping

**Problem:** Title + multiple action buttons in `flex items-center justify-between` overflow on narrow screens.

**Fix:** Add `flex-wrap gap-2` to header rows. On mobile, buttons wrap below the title.

**Affected files:**
- `app/routes/manage/import/jobs.tsx` (title + 3 buttons)
- `app/routes/manage/import/events.tsx` (title + buttons)
- `app/routes/manage/companies/index.tsx` (title + 3 buttons)
- `app/routes/manage/people/index.tsx` (title + 3 buttons)
- `app/routes/manage/events/index.tsx` (title + button)
- `app/routes/manage/jobs/index.tsx` (title + button)
- `app/routes/manage/news/index.tsx` (title + button)
- `app/routes/manage/import/jobs.$sourceId.tsx` (multiple section headers)

### Pattern D: ManageListItem wrapping

**Problem:** `ManageListItem` uses `flex items-center gap-4` with no wrapping. Badges and action buttons overflow.

**Fix:** Add `flex-wrap` to the flex container in `ManageListItem`. This cascades to all list pages that use it.

**Affected file:**
- `app/components/manage/ManageList.tsx`

### Pattern E: Stats/detail grid breakpoints

**Problem:** `grid-cols-5` stats row and `grid-cols-2` detail DL in `jobs.$sourceId.tsx` have no responsive fallback.

**Fix:**
- Stats: `grid-cols-2 md:grid-cols-5` (2-col on mobile, 5-col on desktop)
- Details DL: `grid-cols-1 md:grid-cols-2`

**Affected file:**
- `app/routes/manage/import/jobs.$sourceId.tsx`

### Pattern F: Mobile padding

**Problem:** `p-6` outer padding wastes horizontal space on mobile (48px total).

**Fix:** Change `p-6` to `p-4 md:p-6` on `ManagePage` wrapper and pages that build their own wrapper.

**Affected files:**
- `app/components/manage/ManagePage.tsx`
- Any page not using `ManagePage` that has `min-h-screen p-6` (import pages, comments, settings)

## Implementation Order

1. Shared components first (`ManagePage`, `ManageList`) -- fixes cascade to many pages
2. Critical: import table pages (`import/jobs.tsx`, `import/events.tsx`, `import/jobs.$sourceId.tsx`)
3. High: form pages (`companies/new.tsx`, `companies/edit.tsx`, `jobs/new.tsx`, `jobs/edit.tsx`)
4. Moderate: list page headers and remaining per-page fixes

## Out of Scope

- No shared admin layout wrapper (would be a larger refactor)
- No card-based mobile alternatives to tables (tables with horizontal scroll are sufficient)
- No changes to pages rated LOW severity (dashboard, settings, login, export, review pages, discord pages)
