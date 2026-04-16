# Admin Responsive Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all responsive design issues across the admin pages so they're usable on mobile.

**Architecture:** Targeted Tailwind class changes only. Shared components fixed first so changes cascade. No new components or layout refactors.

**Tech Stack:** Tailwind CSS responsive prefixes (`md:`, `sm:`), existing components

---

### Task 1: Shared Components (ManagePage + ManageList)

**Files:**
- Modify: `app/components/manage/ManagePage.tsx`
- Modify: `app/components/manage/ManageList.tsx`

- [ ] **Step 1: Fix ManagePage padding and header wrapping**

In `app/components/manage/ManagePage.tsx`:

Change outer wrapper padding from `p-6` to `p-4 md:p-6`:
```
oldString: "min-h-screen p-6"
newString: "min-h-screen p-4 md:p-6"
```

Change header flex row to allow wrapping:
```
oldString: "flex items-center justify-between gap-4"
newString: "flex flex-wrap items-center justify-between gap-4"
```

- [ ] **Step 2: Fix ManageListItem wrapping**

In `app/components/manage/ManageList.tsx`:

Change ManageListItem to allow content wrapping:
```
oldString: "flex items-center gap-4 p-4 bg-white border border-harbour-200"
newString: "flex flex-wrap items-center gap-4 p-4 bg-white border border-harbour-200"
```

- [ ] **Step 3: Commit**

```bash
git add app/components/manage/ManagePage.tsx app/components/manage/ManageList.tsx
git commit -m "fix: make ManagePage and ManageListItem responsive

- Reduce padding on mobile (p-4 md:p-6)
- Add flex-wrap to page headers and list items"
```

---

### Task 2: Import Jobs Table (`import/jobs.tsx`)

**Files:**
- Modify: `app/routes/manage/import/jobs.tsx`

- [ ] **Step 1: Fix outer padding**

```
oldString: "min-h-screen p-6"
newString: "min-h-screen p-4 md:p-6"
```

- [ ] **Step 2: Fix header wrapping**

```
oldString: "flex items-center justify-between"
  (line 133, the header row)
newString: "flex flex-wrap items-center justify-between gap-2"
```

- [ ] **Step 3: Fix table overflow**

```
oldString: "border border-harbour-200 bg-white overflow-hidden"
newString: "border border-harbour-200 bg-white overflow-x-auto"
```

- [ ] **Step 4: Commit**

```bash
git add app/routes/manage/import/jobs.tsx
git commit -m "fix: make import/jobs page responsive

- Table scrolls horizontally on mobile
- Header buttons wrap on narrow screens
- Reduced mobile padding"
```

---

### Task 3: Import Events Table (`import/events.tsx`)

**Files:**
- Modify: `app/routes/manage/import/events.tsx`

- [ ] **Step 1: Fix outer padding**

```
oldString: "min-h-screen p-6"
newString: "min-h-screen p-4 md:p-6"
```

- [ ] **Step 2: Fix header wrapping**

```
oldString: "flex items-center justify-between"
  (line 77, the header row)
newString: "flex flex-wrap items-center justify-between gap-2"
```

- [ ] **Step 3: Fix table overflow**

The table wrapper at line 116 has no overflow handling at all. Add `overflow-x-auto`:
```
oldString: "border border-harbour-200"
  (this is the div wrapping the <table>, not other divs with the same border)
newString: "border border-harbour-200 overflow-x-auto"
```

Note: There may be other elements with `"border border-harbour-200"`. The target is specifically the `<div>` wrapping the `<table>` element. Use surrounding context to identify the correct one.

- [ ] **Step 4: Commit**

```bash
git add app/routes/manage/import/events.tsx
git commit -m "fix: make import/events page responsive

- Table scrolls horizontally on mobile
- Header buttons wrap on narrow screens
- Reduced mobile padding"
```

---

### Task 4: Import Job Source Detail (`import/jobs.$sourceId.tsx`) -- Largest Page

**Files:**
- Modify: `app/routes/manage/import/jobs.$sourceId.tsx`

- [ ] **Step 1: Fix outer padding**

```
oldString: "min-h-screen p-6"
newString: "min-h-screen p-4 md:p-6"
```

- [ ] **Step 2: Fix source details DL grid**

```
oldString: "grid grid-cols-2 gap-4 text-sm"
newString: "grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"
```

- [ ] **Step 3: Fix stats grid**

```
oldString: "grid grid-cols-5 gap-4"
newString: "grid grid-cols-2 md:grid-cols-5 gap-4"
```

- [ ] **Step 4: Fix all table wrappers (4 tables with overflow-hidden)**

Fix each of these 4 table wrappers by replacing `overflow-hidden` with `overflow-x-auto`:

Table 1 -- Pending Review:
```
oldString: "border border-blue-200 bg-white overflow-hidden"
newString: "border border-blue-200 bg-white overflow-x-auto"
```

Table 2 -- Active Jobs:
```
oldString: "border border-harbour-200 bg-white overflow-hidden"
  (the one wrapping the Active Jobs table, around line 992)
newString: "border border-harbour-200 bg-white overflow-x-auto"
```

Table 3 -- Hidden Jobs:
```
oldString: "border border-amber-200 bg-white overflow-hidden"
newString: "border border-amber-200 bg-white overflow-x-auto"
```

Table 4 -- Removed Jobs:
```
oldString: "border border-harbour-200 bg-white overflow-hidden"
  (the one wrapping the Removed Jobs table, around line 1154)
newString: "border border-harbour-200 bg-white overflow-x-auto"
```

Note: Tables 2 and 4 share the same className string `"border border-harbour-200 bg-white overflow-hidden"`. Use surrounding code context (section headers, nearby text) to target each one individually. Do NOT use `replaceAll` -- each needs to be identified by its surrounding context.

- [ ] **Step 5: Fix technology preview table wrapper**

The technology preview table wrapper at line 796 has `"border border-harbour-200"` with no overflow. Add `overflow-x-auto`:
```
oldString: "border border-harbour-200"
  (the div wrapping the technology preview <table>)
newString: "border border-harbour-200 overflow-x-auto"
```

Note: This className appears in multiple places in this file. Target only the technology preview table wrapper using surrounding context.

- [ ] **Step 6: Commit**

```bash
git add app/routes/manage/import/jobs.\$sourceId.tsx
git commit -m "fix: make import job source detail page responsive

- All 5 tables scroll horizontally on mobile
- Stats grid reflows to 2 columns on mobile
- Source details DL stacks vertically on mobile
- Reduced mobile padding"
```

---

### Task 5: Form Pages (Companies + Jobs new/edit)

**Files:**
- Modify: `app/routes/manage/companies/new.tsx`
- Modify: `app/routes/manage/companies/edit.tsx`
- Modify: `app/routes/manage/jobs/new.tsx`
- Modify: `app/routes/manage/jobs/edit.tsx`

- [ ] **Step 1: Fix companies/new.tsx grid**

```
oldString: "grid grid-cols-2 gap-4"
  (line 140, Location + Founded row)
newString: "grid grid-cols-1 md:grid-cols-2 gap-4"
```

- [ ] **Step 2: Fix companies/edit.tsx grid**

```
oldString: "grid grid-cols-2 gap-4"
  (line 524, Location + Founded row)
newString: "grid grid-cols-1 md:grid-cols-2 gap-4"
```

- [ ] **Step 3: Fix jobs/new.tsx grids (2 occurrences)**

First grid (Location + Department, line 121):
```
oldString: "grid grid-cols-2 gap-4"
newString: "grid grid-cols-1 md:grid-cols-2 gap-4"
```

Second grid (Workplace Type + Salary, line 149):
```
oldString: "grid grid-cols-2 gap-4"
newString: "grid grid-cols-1 md:grid-cols-2 gap-4"
```

Note: Both occurrences have the same className. Use surrounding context (field labels or nearby content) to target each one individually.

- [ ] **Step 4: Fix jobs/edit.tsx grids (2 occurrences)**

First grid (Location + Department, line 148):
```
oldString: "grid grid-cols-2 gap-4"
newString: "grid grid-cols-1 md:grid-cols-2 gap-4"
```

Second grid (Workplace Type + Salary, line 176):
```
oldString: "grid grid-cols-2 gap-4"
newString: "grid grid-cols-1 md:grid-cols-2 gap-4"
```

Note: Same as jobs/new.tsx -- both have identical classNames. Use surrounding context.

- [ ] **Step 5: Commit**

```bash
git add app/routes/manage/companies/new.tsx app/routes/manage/companies/edit.tsx app/routes/manage/jobs/new.tsx app/routes/manage/jobs/edit.tsx
git commit -m "fix: make company and job forms responsive

- Two-column form grids stack to single column on mobile
- Inputs get full width on narrow screens"
```

---

### Task 6: List Page Headers (companies, people, events)

**Files:**
- Modify: `app/routes/manage/companies/index.tsx`
- Modify: `app/routes/manage/people/index.tsx`
- Modify: `app/routes/manage/events/index.tsx`

- [ ] **Step 1: Fix companies/index.tsx header**

```
oldString: "flex items-center justify-between"
  (line 47, the header row with h1 + buttons)
newString: "flex flex-wrap items-center justify-between gap-2"
```

- [ ] **Step 2: Fix people/index.tsx header**

```
oldString: "flex items-center justify-between"
  (line 47, the header row with h1 + buttons)
newString: "flex flex-wrap items-center justify-between gap-2"
```

- [ ] **Step 3: Fix events/index.tsx header**

```
oldString: "flex items-center justify-between"
  (line 26, the header row)
newString: "flex flex-wrap items-center justify-between gap-2"
```

- [ ] **Step 4: Commit**

```bash
git add app/routes/manage/companies/index.tsx app/routes/manage/people/index.tsx app/routes/manage/events/index.tsx
git commit -m "fix: make list page headers wrap on mobile

- Action buttons wrap below title on narrow screens"
```

---

### Task 7: Remaining Page Padding (comments, settings)

**Files:**
- Modify: `app/routes/manage/comments.tsx`
- Modify: `app/routes/manage/settings.tsx`

- [ ] **Step 1: Fix comments.tsx padding**

```
oldString: "min-h-screen p-6"
newString: "min-h-screen p-4 md:p-6"
```

- [ ] **Step 2: Fix settings.tsx padding**

```
oldString: "min-h-screen p-6"
newString: "min-h-screen p-4 md:p-6"
```

- [ ] **Step 3: Commit**

```bash
git add app/routes/manage/comments.tsx app/routes/manage/settings.tsx
git commit -m "fix: reduce mobile padding on comments and settings pages"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run lint**

```bash
pnpm run lint
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 2: Run build**

```bash
pnpm run build
```

Expected: Build completes successfully with no errors.

- [ ] **Step 3: Verify no remaining `overflow-hidden` on table wrappers**

Search the manage routes for any remaining `overflow-hidden` that wraps a `<table>`:
```bash
# Use grep to check -- should return 0 results in manage/ route files
```

- [ ] **Step 4: Verify no remaining unresponsive `grid-cols-2` in form pages**

Search form pages for `grid-cols-2` without `md:` prefix. Any remaining should be intentional (e.g., inside already-narrow containers).
