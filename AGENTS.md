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

Admin actions and MCP share `app/operations/catalog.ts`. Add strict, client-safe Zod input/output contracts and server operations there; call the same operations through `runAdminOperation` in admin routes. MCP bindings and search are generated from the catalog.

Keep validation, authorization, lifecycle rules, and side effects out of routes and `app/mcp/bridge.ts`. Operations call canonical `app/lib` services for writes. Map new columns in `app/operations/coverage` or exclude them with an explicit reason; keep the admin-route exception list empty. Use public-read operations for anonymous data, and require administrator access for hidden records and operational metadata.

See `docs/operations.md` for the workflow, confirmation rules and tests.

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

`pnpm run migrate-prod` pulls the selected runtime image on Mug, prints its immutable
image ID/revision for confirmation, and runs its packaged migrations in a one-off
container against the existing production volume. Use `--image <tag-or-digest>` to
select a release explicitly. The website stays running; no database is pulled or
pushed and the application container is not replaced.

Pending migrations get a verified, private SQLite backup in the production volume's
`backups/` directory. All pending SQL and journal changes run in one immediate
transaction, with strict foreign-key and quick checks before commit. Failure rolls
back that transaction; do not restore a backup over newer production writes.

Review SQL for compatibility with the running release. WAL allows reads during
migration, but writers still serialize and may hit the busy timeout. Large table
rebuilds or incompatible changes still need a coordinated maintenance window or
staged expand/contract releases. Do not promise every schema change is zero downtime.

Migrations are explicit release operations, not an automatic application-start hook.
Ship and migrate the selected image before deploying code that requires its schema.
`sync-prod`, `backup-prod`, and `push-prod-db` remain available for deliberate data
editing; pulls use a consistent SQLite snapshot, and a full database push still
stops the application and replaces production data.

Agents prepare/test migrations and report them. Run production commands only with
operator authorization. For local migrations, application and tooling honor
`DB_URL`, otherwise `DATA_DIR`/`DB_NAME`.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until your work is in the local main branch.

1. **Run quality gates** (if code changed) - `pnpm run lint:fix`, `pnpm run build`.
2. **Commit** - Write a simple commit message, have some lines of bullet point description if it makes sense.
3. **Verify** - All changes committed to main
