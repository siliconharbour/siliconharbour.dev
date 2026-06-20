# Agent Style

## Design System

This project has a specific visual design language. **Before creating UI**, review `/design` for the design system reference.

Key rules:

- **No rounded corners** - Everything uses sharp, square edges (no `rounded-*` classes)
- **No shadows** - Use `border border-harbour-200` instead of `shadow-*`
- **harbour-\* palette** - Use harbour-600 for primary actions, harbour-700 for headings
- **Semantic colors** - Amber for warnings/hidden, Red for errors, Green for success
- **Tables** - Use `bg-harbour-50` header, `divide-y divide-harbour-100` for rows
- **Badges** - Use `text-xs px-1.5 py-0.5` with appropriate bg/text colors

See `/design` for complete examples of buttons, forms, cards, tables, badges, and alerts.

## Ticket system with `tk`

This project uses a CLI ticket system for task management.

When you are asked to do something, do a brief initial investigation first (identify files, confirm scope, sanity-check approach), then log it as a ticket using `tk` before making edits or running substantive changes. When
you get to the end of a task, see the list of tickets to figure out if there is more work to do.

Run `tk help` if you are unaware how `tk` works.

When given a set of tasks, **continue working until ALL tasks are complete**. Do not stop to ask for confirmation between tasks. Execute the full plan.

## Package Manager

This is a **pnpm** project. Use `pnpm` commands for dependency and script management.
Do not use `npm` in this repository.

## Adding New Routes

This project uses **explicit route definitions** in `app/routes.ts`. When adding new pages:

1. Create your route file in `app/routes/` following existing patterns
2. **Register the route** in `app/routes.ts` - routes will 404 without this step!

Example for adding a new manage page:

```typescript
// In app/routes.ts, find the relevant prefix section and add:
...prefix("manage", [
  // ... existing routes
  route("my-new-page", "routes/manage/my-new-page.tsx"),
]),
```

For API routes, add them in the "Public JSON API" section:

```typescript
route("api/my-endpoint", "routes/api/my-endpoint.tsx"),
route("api/my-endpoint/:id", "routes/api/my-endpoint.$id.tsx"),
```

## MCP Parity

This project exposes admin/data operations through `app/mcp/bridge.ts`.

When you add or change backend features that an operator/agent may need to use remotely,
review whether the MCP bridge should expose them too. Common cases:

- New fields on entities already supported by `createEntity` / `updateEntity`
- New import-source options or sync controls
- New review / lifecycle actions
- New admin-safe lookup or creation flows

If a feature should be operable through MCP, update the relevant Zod schemas and handler
paths in `app/mcp/bridge.ts` before considering the work complete.

## Database

The SQLite database is located at `./data/siliconharbour.db` (configured via `DB_URL` env var).

To query directly:

```bash
sqlite3 ./data/siliconharbour.db "SELECT * FROM ..."
```

## Database Migrations

This project uses Drizzle ORM with SQLite. When adding/modifying database schema:

1. Update the Schema, edit `app/db/schema.ts` with your changes.
2. Create Migration SQL File, create a new file in `drizzle/` with the naming pattern `NNNN_description.sql` (e.g., `0018_add_event_requires_signup.sql`).

**Important SQL syntax rules:**

- Use backticks around table and column names: ``ALTER TABLE `events` ADD `column_name` ...``
- NOT double quotes (those will cause "no such column" errors)
- **Multiple statements require `--> statement-breakpoint`** between each statement. Without it, `better-sqlite3` rejects the file ("contains more than one statement") and `drizzle-kit migrate` fails silently with exit code 1.
- Follow the style of existing migrations in `drizzle/`

Example:

```sql
ALTER TABLE `events` ADD `requires_signup` integer NOT NULL DEFAULT 0;
```

### 3. Register in Journal

Add an entry to `drizzle/meta/_journal.json`:

```json
{
  "idx": 18,
  "version": "6",
  "when": 1768703000000,
  "tag": "0018_add_event_requires_signup",
  "breakpoints": true
}
```

- `idx`: Next sequential number
- `tag`: Must match the SQL filename (without `.sql`)
- `when`: Timestamp (can increment from previous)

### 4. Run Migration (local)

```bash
pnpm run db:migrate
```

This applies the migration to your local `./data/siliconharbour.db`. Do this to verify
the migration SQL is valid and the schema change works as expected.

### 5. Production Migration (operator-run)

**You do NOT run this.** The operator does, after the new code is deployed to prod.

`pnpm run migrate-prod` (defined in `scripts/sync-prod.ts`) orchestrates a zero-data-loss
prod migration with downtime:

1. Stops the production container
2. Backs up the prod database (zip archive in `./tmp/backup/`)
3. Pulls the prod DB locally
4. Runs `pnpm run db:migrate` against the local copy
5. Pushes the migrated DB back to prod
6. Restarts the production container

It prompts for confirmation twice and requires `yes` for both. If the migration fails,
prod is left untouched and a backup is available.

**Your responsibility:** write the migration (schema + SQL + journal), run it locally to
verify it applies cleanly, and tell the operator that a prod migration is needed. The
operator decides when to run `pnpm run migrate-prod` (typically after the code change
is deployed, so the new code matches the new schema).

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until your work is in the local main branch.

1. **Run quality gates** (if code changed) - `pnpm run lint:fix`, `pnpm run build`.
2. **Commit** - Write a simple commit message, have some lines of bullet point description if it makes sense.
3. **Verify** - All changes committed to main
