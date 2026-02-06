# Agent Style

## Design System

This project has a specific visual design language. **Before creating UI**, review `/design` for the design system reference.

Key rules:
- **No rounded corners** - Everything uses sharp, square edges (no `rounded-*` classes)
- **No shadows** - Use `border border-harbour-200` instead of `shadow-*`
- **harbour-* palette** - Use harbour-600 for primary actions, harbour-700 for headings
- **Semantic colors** - Amber for warnings/hidden, Red for errors, Green for success
- **Tables** - Use `bg-harbour-50` header, `divide-y divide-harbour-100` for rows
- **Badges** - Use `text-xs px-1.5 py-0.5` with appropriate bg/text colors

See `/design` for complete examples of buttons, forms, cards, tables, badges, and alerts.

## Ticket system with `tk`

This project uses a CLI ticket system for task management.

When you are asked to do something, you should first log it as a ticket using `tk`, before you start work on it, and when
you get to the end of a task, see the list of tickets to figure out if there is more work to do.

Run `tk help` if you are unaware how `tk` works.

When given a set of tasks, **continue working until ALL tasks are complete**. Do not stop to ask for confirmation between tasks. Execute the full plan.

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

### 4. Run Migration

```bash
npm run db:migrate
```

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until your work is in the local main branch.

1. **Run quality gates** (if code changed) - `npm run lint:fix`, `npm run build`.
2. **Commit** - Write a simple commit message, have some lines of bullet point description if it makes sense.
3. **Verify** - All changes committed to main
